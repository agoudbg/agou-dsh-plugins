import path from 'node:path';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import { WorktreeManager } from './lib/manager.js';
import { LinkedWorktreeDiscovery } from './discovery.js';

const id = z.string().min(1).max(256);
const schemas = {
  workspace: z.object({ workspaceId: id }).strict(),
  checkout: z.object({ workspaceId: id, branch: z.string().min(1).max(4096) }).strict(),
  prepare: z.object({
    sessionId: id,
    operationId: id,
    choice: z.object({ mode: z.enum(['local', 'new']), baseRef: z.string().min(1).max(4096).optional() }).strict().optional(),
  }).strict(),
  settle: z.object({ sessionId: id, operationId: id }).strict(),
  list: z.object({ refresh: z.boolean().optional() }).strict(),
  restore: z.object({ worktreeId: id }).strict(),
  remove: z.object({ worktreeId: id }).strict(),
  configure: z.object({
    directory: z.string().min(1).max(32767).optional(),
    maxRetained: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
    expectedRevision: z.number().int().nonnegative(),
  }).strict(),
};
export const RPC_ENDPOINTS = Object.freeze(Object.keys(schemas));

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function within(root, target) {
  if (!root || !target) return false;
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function workspaceValue(workspace) {
  return { workspaceId: workspace.id, path: workspace.path, title: workspace.title };
}

/** Extract only accepted human input, including queued messages, from a durable inbox splice. */
export function acceptedMessages(event) {
  if (event.type !== 'agent/inbox/spliced') return [];
  return (event.data.inserted ?? []).filter(message => message.source?.kind === 'user').map(message => ({
    requestId: message.source.rpcId ?? message.id ?? `${event.seq}`,
    acceptedAt: event.time,
  }));
}

/** Host adapter: explicit Session/Workspace identities; no ambient active Session. */
export class WorktreeHost {
  constructor(ctx, config, storage, Manager = WorktreeManager) {
    this.ctx = ctx;
    this.config = config;
    this.controller = new AbortController();
    this.operations = new Set();
    this.reservations = new Map();
    this.accepting = new Map();
    this.reconciled = new Map();
    this.discovery = new LinkedWorktreeDiscovery(ctx);
    this.discoveryPending = null;
    this.discoveryNext = 0;
    this.discoveryDiagnostics = '';
    this.cleanupTimer = null;
    this.cleanupRunning = false;
    this.cleanupRequested = false;
    this.retryDelay = 30_000;
    this.manager = new Manager({
      storage,
      getConfig: () => this.configuration(),
      setDirectory: (sessionId, directory) => this.setDirectory(sessionId, directory),
      isProtected: record => this.protection(record),
      archiveSessions: async ids => {
        for (const sessionId of ids) await this.ctx.workspaceRegistry.archiveSession(sessionId);
      },
    });
  }

  configuration() {
    return { directory: this.config.directory.get(), maxRetained: this.config.maxRetained.get() };
  }

  track(operation) {
    this.operations.add(operation);
    operation.then(() => this.operations.delete(operation), () => this.operations.delete(operation));
    return operation;
  }

  report(error) {
    if (!this.controller.signal.aborted) this.ctx.logger.warn(`worktrees: ${errorMessage(error)}`);
  }

  workspace(workspaceId) {
    const workspace = this.ctx.workspaceRegistry.get(workspaceId);
    if (!workspace) throw new Error('The workspace is no longer registered.');
    return workspaceValue(workspace);
  }

  workspaceFor(session) {
    const workspace = this.ctx.workspaceRegistry.list().find(item => item.sessionIds.includes(session.id));
    if (workspace) return workspaceValue(workspace);
    const binding = this.manager.list().bindings[session.id];
    return binding ? { workspaceId: binding.workspaceId, path: binding.workspacePath, title: binding.workspaceTitle } : undefined;
  }

  async resolveAgent(sessionId) {
    const result = await this.ctx.sessionController.resolveAgent(sessionId);
    if ('error' in result) throw result.error;
    this.controller.signal.throwIfAborted();
    return result.agent;
  }

  async setDirectory(sessionId, directory) {
    const agent = this.ctx.agents.get(sessionId);
    if (!agent) throw new Error('The session was closed before its worktree was ready.');
    const current = this.ctx.workingDirectory.get(agent.session);
    const binding = this.manager.list().bindings[sessionId];
    // Local sessions retain native navigation; managed sessions retain navigation inside their checkout.
    if (binding?.acceptedAt != null && (binding.mode === 'local' || within(directory, current))) return;
    await this.ctx.workingDirectory.set(agent, directory, this.controller.signal);
  }

  async assertAvailable(agent, signal) {
    if (!this.manager.list().bindings[agent.id]?.worktreeId) return;
    const binding = await this.manager.assertAvailable(agent.id, signal);
    if (binding?.mode !== 'new') return;
    const current = this.ctx.workingDirectory.get(agent.session);
    if (!within(binding.path, current)) return;
    let currentDirectory;
    try { currentDirectory = await stat(current); }
    catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
    signal?.throwIfAborted();
    // Native ensure() falls back to the immutable source cwd. Keep recovery inside this verified checkout.
    if (!currentDirectory?.isDirectory()) await this.ctx.workingDirectory.set(agent, binding.path, signal);
  }

  async protection(record) {
    const reasons = [];
    const pinned = new Set(this.ctx.workspaceRegistry.pinnedSessionIds);
    for (const sessionId of record.sessionIds) {
      if (pinned.has(sessionId)) reasons.push('pinned');
      if (this.reservations.has(sessionId)) reasons.push('sending');
      try {
        const activity = await this.ctx.waterfall('workspace/session-activity', { sessionId }, async () => []);
        if (activity.length) reasons.push('active');
      } catch (error) {
        reasons.push('activity-unavailable');
        this.report(error);
      }
    }
    // An explicitly registered workspace rooted in a checkout is never disposable.
    if (this.ctx.workspaceRegistry.list().some(item => within(record.path, item.path))) reasons.push('workspace');
    return [...new Set(reasons)];
  }

  observe(session, event) {
    const binding = this.manager.list().bindings[session.id];
    const accepted = acceptedMessages(event).filter(item => binding && item.acceptedAt >= binding.preparedAt);
    if (!accepted.length) return Promise.resolve();
    const previous = this.accepting.get(session.id) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      for (const item of accepted) await this.manager.remember({ sessionId: session.id, ...item });
    });
    this.accepting.set(session.id, operation);
    this.track(operation).catch(error => this.report(error));
    return operation;
  }

  async reconcile(session) {
    const events = session.snapshotEvents();
    const cursor = this.reconciled.get(session.id) ?? 0;
    for (const event of events.slice(cursor)) await this.observe(session, event);
    this.reconciled.set(session.id, events.length);
  }

  async inherit(agent, signal) {
    const session = agent.session;
    if (!session.header.parentSession || this.manager.list().bindings[session.id]) return;
    const parent = this.manager.list().bindings[session.header.parentSession];
    if (!parent?.worktreeId) return;
    const workspace = this.workspaceFor(session) ?? { workspaceId: parent.workspaceId, path: parent.workspacePath, title: parent.workspaceTitle };
    await this.manager.bindInheritedSession(session.id, session.header.parentSession, workspace, this.ctx.workingDirectory.get(session), signal);
  }

  async prepare(request, peer, signal) {
    const present = this.reservations.get(request.sessionId);
    if (present && (present.operationId !== request.operationId || present.peerId !== peer.id)) {
      const error = new Error('Another message is preparing this session. Wait for it to finish, then send again.');
      error.code = 'SEND_IN_PROGRESS';
      throw error;
    }
    let reservation = present;
    if (!reservation) {
      const release = () => {
        if (this.reservations.get(request.sessionId) === reservation) this.reservations.delete(request.sessionId);
      };
      reservation = { operationId: request.operationId, peerId: peer.id, release, unsubscribe: () => peer.signal.removeEventListener('abort', release) };
      this.reservations.set(request.sessionId, reservation);
      peer.signal.addEventListener('abort', release, { once: true });
    }
    try {
      const agent = await this.resolveAgent(request.sessionId);
      await this.inherit(agent, signal);
      await this.reconcile(agent.session);
      const workspace = this.workspaceFor(agent.session);
      if (!workspace) {
        await this.settle(request, peer);
        return { ready: true, actualDirectory: this.ctx.workingDirectory.get(agent.session), passthrough: true };
      }
      const binding = this.manager.list().bindings[request.sessionId];
      const hasHumanHistory = agent.session.snapshotEvents().some(event => acceptedMessages(event).length > 0 || event.type === 'user/message' && event.data.source?.kind === 'user');
      if (!binding && hasHumanHistory) {
        if (request.choice?.mode === 'new') throw new Error('A new worktree can only be selected before this session’s first message.');
        await this.settle(request, peer);
        return { ready: true, actualDirectory: this.ctx.workingDirectory.get(agent.session), passthrough: true };
      }
      const choice = request.choice ?? (binding ? { mode: binding.mode, ...(binding.baseRef ? { baseRef: binding.baseRef } : {}) } : (await this.manager.inspectWorkspace(workspace, signal)).choice);
      const prepared = await this.manager.prepare({ sessionId: request.sessionId, workspace, choice, operationId: request.operationId }, signal);
      if (prepared.requiresRestore && !prepared.worktree.snapshotCommit) throw Object.assign(new Error(`The worktree directory is missing and no recovery snapshot is available: ${prepared.worktree.path}`), { code: 'DIRECTORY_MISSING' });
      if (prepared.requiresRestore) return {
        requiresRestore: true,
        worktreeId: prepared.worktree.id,
        path: prepared.worktree.path,
        snapshotRef: prepared.worktree.snapshotRef,
      };
      this.requestCleanup();
      return { ready: true, actualDirectory: this.ctx.workingDirectory.get(agent.session), ...(prepared.worktree ? { worktreeId: prepared.worktree.id } : {}) };
    } catch (error) {
      await this.settle(request, peer).catch(settleError => this.report(settleError));
      throw error;
    }
  }

  async settle(request, peer) {
    const reservation = this.reservations.get(request.sessionId);
    if (!reservation || reservation.operationId !== request.operationId || reservation.peerId !== peer.id) return { settled: true };
    const agent = this.ctx.agents.get(request.sessionId);
    try {
      if (agent) await this.reconcile(agent.session);
      await this.accepting.get(request.sessionId);
    } finally {
      reservation.unsubscribe();
      reservation.release();
    }
    this.requestCleanup();
    return { settled: true };
  }

  descriptor() {
    const descriptor = this.ctx.settings.describe({ redactSecrets: true }).find(item => item.ns === 'worktrees');
    if (!descriptor) throw new Error('The worktrees settings entry is not active.');
    return descriptor;
  }

  requestDiscovery(invalidate = false) {
    if (this.controller.signal.aborted) return;
    if (invalidate) {
      this.discovery.invalidate();
      this.discoveryNext = 0;
    }
    if (this.discoveryPending || Date.now() < this.discoveryNext) return;
    this.discoveryNext = Date.now() + 30_000;
    this.discoveryPending = this.track(this.discovery.refresh(this.manager.list(), this.controller.signal).then(value => {
      const diagnostics = JSON.stringify(value.diagnostics);
      if (diagnostics !== this.discoveryDiagnostics) {
        this.discoveryDiagnostics = diagnostics;
        for (const item of value.diagnostics) this.report(new Error(`Worktree discovery: ${item.message}`));
      }
    }).catch(error => {
      if (error.code !== 'DISCOVERY_INVALIDATED') this.report(error);
    }).finally(() => {
      this.discoveryPending = null;
      if (this.discoveryNext === 0) this.requestDiscovery();
    }));
  }

  async list(refresh, signal) {
    if (refresh) await this.manager.refresh(signal);
    this.requestDiscovery();
    const state = this.manager.list();
    const records = [];
    for (const record of Object.values(state.worktrees)) {
      signal?.throwIfAborted();
      const protectionReasons = await this.protection(record);
      const { token: _token, ...visible } = record;
      records.push({ ...visible, snapshotRef: record.snapshotCommit ? record.snapshotRef : null, repositoryRoot: record.sourceRoot, protected: protectionReasons.length > 0, protectionReasons });
    }
    return {
      records,
      observed: this.discovery.snapshot().records,
      bindings: Object.values(state.bindings),
      preferences: Object.entries(state.preferences).map(([workspaceId, choice]) => ({ workspaceId, ...choice })),
      config: this.configuration(),
      revision: this.descriptor().revision,
      directoryPickerKind: this.ctx.get('directoryPicker')?.capability().kind ?? null,
    };
  }

  async restore(worktreeId, signal) {
    const record = await this.manager.restore(worktreeId, signal);
    this.requestCleanup();
    return { worktreeId: record.id, path: record.path };
  }

  async remove(worktreeId, signal) {
    const record = await this.manager.remove(worktreeId, signal);
    this.requestCleanup();
    return { worktreeId: record.id, status: record.status };
  }

  async configure(request) {
    const { expectedRevision, ...patch } = schemas.configure.parse(request);
    if (patch.directory && !path.isAbsolute(patch.directory)) throw new Error('Worktree directory must be an absolute path on the Host.');
    await this.ctx.settings.update('worktrees', patch, expectedRevision);
    this.requestCleanup();
    return { config: this.configuration(), revision: this.descriptor().revision };
  }

  async dispatch(endpoint, input, signal, peer) {
    if (peer?.principal?.kind !== 'owner') throw Object.assign(new Error('Worktree management requires the Host owner.'), { code: 'FORBIDDEN' });
    if (!Object.hasOwn(schemas, endpoint)) throw Object.assign(new Error('Unknown worktree operation.'), { code: 'NOT_FOUND' });
    const request = schemas[endpoint].parse(input ?? {});
    signal.throwIfAborted();
    switch (endpoint) {
      case 'workspace': return this.manager.inspectWorkspace(this.workspace(request.workspaceId), signal);
      case 'checkout': return this.manager.checkout(this.workspace(request.workspaceId), request.branch, signal);
      case 'prepare': return this.prepare(request, peer, signal);
      case 'settle': return this.settle(request, peer);
      case 'list': return this.list(request.refresh === true, signal);
      case 'restore': return this.restore(request.worktreeId, signal);
      case 'remove': return this.remove(request.worktreeId, signal);
      case 'configure': return this.configure(request);
      default: throw new Error('Unknown worktree operation.');
    }
  }

  rpc(endpoint, input, signal, peer) {
    const control = AbortSignal.any([signal, this.controller.signal, peer.signal]);
    return this.track(this.dispatch(endpoint, input, control, peer).then(value => ({ ok: true, value }), error => ({
      ok: false,
      error: { code: typeof error.code === 'string' ? error.code : 'WORKTREE_ERROR', message: errorMessage(error), details: {} },
    })));
  }

  requestCleanup(delay = 1000) {
    if (this.controller.signal.aborted) return;
    this.cleanupRequested = true;
    if (this.cleanupRunning || this.cleanupTimer) return;
    this.cleanupTimer = setTimeout(() => {
      this.cleanupTimer = null;
      this.track(this.clean()).catch(error => this.report(error));
    }, delay);
    this.cleanupTimer.unref?.();
  }

  async clean() {
    if (this.controller.signal.aborted || this.cleanupRunning || !this.cleanupRequested) return;
    this.cleanupRequested = false;
    this.cleanupRunning = true;
    try {
      const result = await this.manager.cleanup(this.controller.signal);
      if (result.errors.length) {
        for (const item of result.errors) this.report(new Error(item.message));
        this.requestCleanup(this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, 300_000);
      } else {
        this.retryDelay = 30_000;
        if (result.removed.length && result.eligible - result.removed.length > this.configuration().maxRetained) this.cleanupRequested = true;
      }
    } finally {
      this.cleanupRunning = false;
      if (this.cleanupRequested) this.requestCleanup(this.retryDelay);
    }
  }

  async start() {
    // Recover only sends prepared since the last recorded admission; reading never resumes an Agent.
    for (const binding of Object.values(this.manager.list().bindings)) {
      if (binding.acceptedAt != null && binding.preparedAt <= binding.acceptedAt) continue;
      try {
        const inspected = await this.ctx.sessionController.inspect(binding.sessionId, this.controller.signal);
        for (const event of inspected.events) {
          for (const accepted of acceptedMessages(event).filter(item => item.acceptedAt >= binding.preparedAt)) await this.manager.remember({ sessionId: binding.sessionId, ...accepted });
        }
      } catch (error) { this.report(error); }
    }
    await this.manager.refresh(this.controller.signal);
    this.requestDiscovery();
    this.requestCleanup();
  }

  context(agent) {
    const binding = agent && this.manager.list().bindings[agent.id];
    const record = binding?.worktreeId && this.manager.list().worktrees[binding.worktreeId];
    if (!record || record.status === 'removed') return '';
    return `Managed Git worktree: ${JSON.stringify(record.path)}. Created from ${JSON.stringify(record.baseRef)} at ${record.baseCommit}. This checkout was created detached. Before making authorized code changes, inspect Git HEAD and create a task branch from the current HEAD if still detached; honor a branch name requested by the user. Do not create a branch for a read-only task, or commit or push without the user's instruction.`;
  }

  async dispose() {
    this.controller.abort(new Error('Worktree plugin disposed.'));
    this.discovery.dispose();
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
    for (const reservation of this.reservations.values()) reservation.unsubscribe();
    this.reservations.clear();
    await this.manager.dispose();
    await Promise.allSettled([...this.operations]);
  }
}
