import path from 'node:path';
import { bounded, canonical, commitAt, digest, git, repository, samePath, WorktreeError } from './lib/git.js';

const CONCURRENCY = 4;
const EMPTY = Object.freeze({ records: Object.freeze([]), diagnostics: Object.freeze([]) });

function pathKey(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function missingPath(error) {
  return ['INVALID_PATH', 'ENOENT', 'ENOTDIR'].includes(error?.code);
}

function notWorktree(error) {
  return error?.code === 'GIT_FAILED' && /fatal: (?:not a git repository \(or any (?:of the parent directories|parent up to mount point)[^\r\n]*\)|this operation must be run in a work tree)/i.test(error.message);
}

function diagnostic(error, directory, sessionIds) {
  return Object.freeze({
    ...(directory ? { path: directory } : {}),
    ...(sessionIds ? { sessionIds: Object.freeze([...sessionIds]) } : {}),
    code: typeof error?.code === 'string' ? error.code : 'DISCOVERY_FAILED',
    message: error instanceof Error ? error.message : String(error),
  });
}

function managedSessions(state) {
  return new Set(Object.values(state?.bindings ?? {}).filter(binding => binding?.mode === 'new' && binding.worktreeId).map(binding => binding.sessionId));
}

/** Read-only linked-checkout metadata. No refs, index entries, or worktree files are changed. */
async function inspectDirectory(directory, signal) {
  let inspected;
  try {
    inspected = await repository(directory, signal);
  } catch (error) {
    if (notWorktree(error)) return null;
    throw error;
  }
  const gitDirResult = await git(inspected.root, ['rev-parse', '--absolute-git-dir'], { signal, maxOutput: 64 * 1024 });
  const gitDir = await canonical(gitDirResult.stdout.replace(/\r?\n$/, ''));
  if (samePath(gitDir, inspected.commonDir)) return null;
  const branch = await git(inspected.root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { signal, allowed: [0, 1], maxOutput: 64 * 1024 });
  const head = await commitAt(inspected.root, 'HEAD', signal, true);
  return Object.freeze({
    id: `external:${digest(pathKey(inspected.root))}`,
    path: inspected.root,
    currentBranch: branch.code === 0 ? branch.stdout.replace(/\r?\n$/, '') : null,
    head,
    baseRef: null,
    status: 'ready',
    external: true,
  });
}

/**
 * Observe existing linked worktrees without adopting them into managed state.
 * ctx only needs sessionController.list({}, signal) and workspaceRegistry.list().
 * Each refresh reads session membership; Git metadata is cached for cacheMs.
 * Concurrent refresh calls share one scan. Cancelling the final waiter stops it.
 */
export class LinkedWorktreeDiscovery {
  constructor(ctx, { cacheMs = 30_000, maxDirectories = 256, scanTimeoutMs = 10_000 } = {}) {
    for (const [name, value, minimum] of [['cacheMs', cacheMs, 0], ['maxDirectories', maxDirectories, 1], ['scanTimeoutMs', scanTimeoutMs, 1]]) {
      if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${name} must be an integer of at least ${minimum}.`);
    }
    this.ctx = ctx;
    this.cacheMs = cacheMs;
    this.maxDirectories = maxDirectories;
    this.scanTimeoutMs = scanTimeoutMs;
    this.cache = new Map();
    this.value = EMPTY;
    this.pending = null;
    this.managed = new Set();
    this.generation = 0;
    this.disposed = false;
  }

  snapshot() {
    return this.value;
  }

  invalidate() {
    this.generation += 1;
    this.cache.clear();
    this.pending?.controller.abort(new WorktreeError('DISCOVERY_INVALIDATED', 'Worktree discovery was invalidated.'));
    this.pending = null;
  }

  dispose() {
    this.disposed = true;
    this.invalidate();
    this.value = EMPTY;
  }

  refresh(state, signal) {
    signal?.throwIfAborted();
    if (this.disposed) return Promise.reject(new WorktreeError('DISCOVERY_DISPOSED', 'Worktree discovery is disposed.'));
    this.managed = managedSessions(state);
    this.value = this.excludeManaged(this.value);
    let pending = this.pending;
    if (!pending || pending.controller.signal.aborted) {
      pending = { controller: new AbortController(), waiters: 0, promise: null };
      const generation = this.generation;
      const timer = setTimeout(() => pending.controller.abort(new WorktreeError('DISCOVERY_TIMEOUT', `Worktree discovery exceeded ${this.scanTimeoutMs} ms.`)), this.scanTimeoutMs);
      timer.unref();
      pending.promise = this.scan(pending.controller.signal, generation).then(value => {
        if (!pending.controller.signal.aborted && generation === this.generation && !this.disposed) this.value = this.excludeManaged(value);
        return this.value;
      }).finally(() => {
        clearTimeout(timer);
        if (this.pending === pending) this.pending = null;
      });
      this.pending = pending;
    }
    pending.waiters += 1;
    return bounded(pending.promise, signal).finally(() => {
      pending.waiters -= 1;
      if (pending.waiters === 0 && this.pending === pending) pending.controller.abort(new WorktreeError('ABORTED', 'Worktree discovery has no remaining callers.'));
    });
  }

  excludeManaged(value) {
    const records = value.records.map(record => {
      const sessionIds = record.sessionIds.filter(id => !this.managed.has(id));
      return sessionIds.length === record.sessionIds.length ? record : Object.freeze({ ...record, sessionIds: Object.freeze(sessionIds) });
    }).filter(record => record.sessionIds.length);
    if (records.length === value.records.length && records.every((record, index) => record === value.records[index])) return value;
    return Object.freeze({ records: Object.freeze(records), diagnostics: value.diagnostics });
  }

  async inspect(directory, signal, inFlight, generation) {
    let real;
    try {
      real = await canonical(directory);
    } catch (error) {
      if (missingPath(error)) return { record: null };
      throw error;
    }
    signal.throwIfAborted();
    const key = pathKey(real);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      if (cached.expiresAt > Date.now()) {
        this.cache.set(key, cached);
        return cached.result;
      }
    }
    if (inFlight.has(key)) return inFlight.get(key);
    const promise = inspectDirectory(real, signal).then(record => ({ record }), error => {
      signal.throwIfAborted();
      // ENOENT here can be a missing Git executable, so it remains observable.
      return { error };
    }).then(result => {
      if (generation === this.generation && !signal.aborted) {
        this.cache.set(key, { result, expiresAt: Date.now() + this.cacheMs });
        while (this.cache.size > this.maxDirectories) this.cache.delete(this.cache.keys().next().value);
      }
      return result;
    });
    inFlight.set(key, promise);
    return promise;
  }

  async scan(signal, generation) {
    const value = await bounded(this.ctx.sessionController.list({}, signal), signal);
    signal.throwIfAborted();
    if (!Array.isArray(value?.items)) throw new TypeError('Session list must contain an items array.');
    const workspaces = this.ctx.workspaceRegistry.list();
    if (!Array.isArray(workspaces)) throw new TypeError('Workspace list must be an array.');
    const membership = new Map();
    for (const workspace of workspaces) {
      for (const sessionId of workspace.sessionIds) if (!membership.has(sessionId)) membership.set(sessionId, workspace);
    }
    const directories = new Map();
    for (const session of value.items) {
      if (typeof session?.sessionId !== 'string' || !session.sessionId || this.managed.has(session.sessionId)) continue;
      const projected = session.projections?.values?.workingDirectory;
      const directory = projected === undefined ? session.cwd : projected;
      if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.includes('\0')) continue;
      const key = pathKey(directory);
      if (!directories.has(key)) directories.set(key, { directory, sessionIds: new Set() });
      directories.get(key).sessionIds.add(session.sessionId);
    }
    const diagnostics = [];
    const entries = [...directories.values()];
    if (entries.length > this.maxDirectories) diagnostics.push(diagnostic(new WorktreeError('DISCOVERY_LIMIT', `Inspected at most ${this.maxDirectories} of ${entries.length} session directories.`)));
    const queue = entries.slice(0, this.maxDirectories);
    const results = new Array(queue.length);
    const inFlight = new Map();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (next < queue.length) {
        signal.throwIfAborted();
        const index = next++;
        try {
          results[index] = await this.inspect(queue[index].directory, signal, inFlight, generation);
        } catch (error) {
          signal.throwIfAborted();
          results[index] = { error };
        }
      }
    }));
    signal.throwIfAborted();
    const records = new Map();
    for (let index = 0; index < queue.length; index += 1) {
      const { directory, sessionIds } = queue[index];
      const { record, error } = results[index];
      if (error) { diagnostics.push(diagnostic(error, directory, sessionIds)); continue; }
      if (!record) continue;
      let grouped = records.get(record.id);
      if (!grouped) { grouped = { ...record, sessionIds: new Set() }; records.set(record.id, grouped); }
      for (const sessionId of sessionIds) {
        grouped.sessionIds.add(sessionId);
        const workspace = membership.get(sessionId);
        if (!grouped.workspaceId && workspace) {
          grouped.workspaceId = workspace.id;
          grouped.workspaceTitle = workspace.title;
        }
      }
    }
    // Bound cached metadata even when sessions keep moving between directories.
    const now = Date.now();
    for (const [key, cached] of this.cache) if (cached.expiresAt <= now) this.cache.delete(key);
    return Object.freeze({
      records: Object.freeze([...records.values()].map(record => Object.freeze({ ...record, sessionIds: Object.freeze([...record.sessionIds]) }))),
      diagnostics: Object.freeze(diagnostics),
    });
  }
}
