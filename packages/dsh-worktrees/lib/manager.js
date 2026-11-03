import { randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { bounded, canonical, commitAt, exists, fail, filterOverrides, git, inside, repository, samePath, WorktreeError } from './git.js';
import { assertSnapshotUnchanged, makeSnapshot, materialize } from './snapshot.js';
import { freeze, requireIdentifier, validateState } from './state.js';

export { createInitialState, validateState } from './state.js';

const OWNER_GRACE = 60 * 60 * 1000;
const NEWBORN_GRACE = 60 * 1000;
const CLEANUP_LIMIT = 8;
const CLEANUP_TIME = 30_000;

function message(error) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 8192) || 'Unknown worktree error';
}

function selected(choice) {
  if (!choice || !['local', 'new'].includes(choice.mode)) throw new TypeError('Choice must specify local or new mode.');
  return choice.mode === 'local' ? { mode: 'local' } : { mode: 'new', baseRef: choice.baseRef };
}

function has(object, key) {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

function markerOf(record) {
  return {
    version: 1, owner: 'dsh-worktrees', id: record.id, token: record.token,
    path: record.path, commonDir: record.commonDir, managedRoot: record.managedRoot,
    sourceRoot: record.sourceRoot, baseCommit: record.baseCommit,
  };
}

/** One instance owns one profile's aggregate. All storage writes are serialized independently of Git work. */
export class WorktreeManager {
  constructor({ storage, getConfig, setDirectory, isProtected = async () => false, archiveSessions = async () => {}, now = Date.now, onChange }) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') throw new TypeError('storage.get and storage.set are required.');
    if (typeof getConfig !== 'function' || typeof setDirectory !== 'function') throw new TypeError('getConfig and setDirectory are required.');
    this.storage = storage;
    this.getConfig = getConfig;
    this.setDirectory = setDirectory;
    this.isProtected = isProtected;
    this.archiveSessions = archiveSessions;
    this.now = now;
    this.onChange = onChange;
    this.state = freeze(validateState(storage.get()));
    this.writes = Promise.resolve();
    this.sessions = new Map();
    this.records = new Map();
    this.pending = new Set();
    this.inUse = new Map();
    this.lifetime = new AbortController();
    this.cleaning = false;
  }

  list() {
    return this.state;
  }

  _run(callback, signal) {
    const operationSignal = signal ? AbortSignal.any([this.lifetime.signal, signal]) : this.lifetime.signal;
    const operation = Promise.resolve().then(() => {
      operationSignal.throwIfAborted();
      return callback(operationSignal);
    });
    this.pending.add(operation);
    operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation));
    return operation;
  }

  _lock(map, key, callback) {
    const previous = map.get(key) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(callback);
    map.set(key, operation);
    operation.then(() => { if (map.get(key) === operation) map.delete(key); }, () => { if (map.get(key) === operation) map.delete(key); });
    return operation;
  }

  _save(update) {
    const operation = this.writes.catch(() => {}).then(async () => {
      const next = structuredClone(this.state);
      const result = update(next);
      const valid = freeze(validateState(next));
      await this.storage.set(valid);
      this.state = valid;
      this.onChange?.();
      return result;
    });
    this.writes = operation;
    return operation;
  }

  _record(id) {
    const record = has(this.state.worktrees, id);
    if (!record) fail('NOT_FOUND', 'The managed worktree does not exist.');
    return record;
  }

  async _failure(id, error, status = 'error') {
    try {
      await this._save(state => {
        const record = state.worktrees[id];
        if (record) {
          record.status = status;
          record.error = message(error);
        }
      });
    } catch (storageError) {
      throw new AggregateError([error, storageError], `${message(error)} Metadata could not be saved: ${message(storageError)}`);
    }
  }

  async _workspace(workspace) {
    requireIdentifier(workspace?.workspaceId, 'workspaceId');
    if (typeof workspace.title !== 'string' && workspace.title !== undefined) throw new TypeError('Workspace title must be text.');
    return { workspaceId: workspace.workspaceId, path: await canonical(workspace.path), title: workspace.title ?? '' };
  }

  async _inspect(workspace, signal) {
    const original = await this._workspace(workspace);
    const preference = has(this.state.preferences, original.workspaceId);
    let repo;
    try {
      repo = await repository(original.path, signal);
    } catch (error) {
      signal.throwIfAborted();
      const unavailable = error.code === 'ENOENT' && (error.path === 'git' || error.syscall?.startsWith('spawn'));
      if (!unavailable && (error.code !== 'GIT_FAILED' || !/not a git repository|must be run in a work tree/i.test(error.message))) throw error;
      return { workspaceId: original.workspaceId, isGit: false, repositoryRoot: null, currentBranch: null, head: null, defaultBase: null, branches: [], choice: { mode: 'local' }, reason: unavailable ? 'git-unavailable' : 'not-git' };
    }
    const refs = await git(repo.root, ['for-each-ref', '--format=%(refname)%00%(symref)', 'refs/heads/', 'refs/remotes/'], { signal });
    const branches = [];
    const remoteHeads = [];
    for (const line of refs.stdout.split('\n').filter(Boolean)) {
      const [ref, symbolic] = line.replace(/\r$/, '').split('\0');
      if (symbolic) {
        if (/^refs\/remotes\/[^/]+\/HEAD$/.test(ref)) remoteHeads.push({ ref, target: symbolic });
        continue;
      }
      if (ref.startsWith('refs/heads/')) branches.push({ name: ref.slice(11), ref, remote: null });
      else if (ref.startsWith('refs/remotes/')) {
        const name = ref.slice(13);
        branches.push({ name, ref, remote: name.split('/')[0] });
      }
    }
    const symbolic = await git(repo.root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { signal, allowed: [0, 1] });
    const currentBranch = symbolic.code === 0 ? symbolic.stdout.trim() : null;
    const head = await commitAt(repo.root, 'HEAD', signal, true);
    const localFor = ref => {
      const match = /^refs\/remotes\/[^/]+\/(.+)$/.exec(ref);
      return match && branches.some(branch => branch.ref === `refs/heads/${match[1]}`) ? `refs/heads/${match[1]}` : ref;
    };
    const remoteDefault = remoteHeads.find(item => item.ref === 'refs/remotes/origin/HEAD') ?? (remoteHeads.length === 1 ? remoteHeads[0] : undefined);
    let defaultBase = remoteDefault && branches.some(branch => branch.ref === remoteDefault.target) ? localFor(remoteDefault.target) : null;
    if (!defaultBase) defaultBase = ['refs/heads/main', 'refs/heads/master', currentBranch ? `refs/heads/${currentBranch}` : null].find(ref => branches.some(branch => branch.ref === ref)) ?? null;
    const rememberedBase = branches.some(branch => branch.ref === preference?.baseRef) || preference?.baseRef === 'HEAD' && head ? preference.baseRef : null;
    const choice = preference?.mode === 'new' ? { mode: 'new', baseRef: rememberedBase ?? defaultBase } : { mode: 'local', ...(rememberedBase ? { baseRef: rememberedBase } : {}) };
    return { workspaceId: original.workspaceId, isGit: true, repositoryRoot: repo.root, currentBranch, head, defaultBase, branches, choice, ...(head ? {} : { reason: 'unborn-head' }) };
  }

  inspectWorkspace(workspace, signal) {
    return this._run(operationSignal => this._inspect(workspace, operationSignal), signal);
  }

  checkout(workspace, branch, signal) {
    return this._run(operationSignal => this._lock(this.sessions, `workspace:${workspace?.workspaceId}`, async () => {
      const inspected = await this._inspect(workspace, operationSignal);
      if (!inspected.isGit) fail('NOT_GIT', 'Local checkout requires a Git repository.');
      const match = inspected.branches.find(item => !item.remote && (item.ref === branch || item.name === branch));
      if (!match || match.name.startsWith('-')) fail('INVALID_BRANCH', 'Local checkout requires an existing local branch whose name does not begin with "-".');
      const overrides = await filterOverrides(inspected.repositoryRoot, operationSignal);
      await git(inspected.repositoryRoot, [...overrides, 'checkout', '--no-guess', '--no-recurse-submodules', match.name, '--'], { signal: operationSignal });
      return this._inspect(workspace, operationSignal);
    }), signal);
  }

  async _marker(record, create = false) {
    const common = await canonical(record.commonDir);
    if (!samePath(common, record.commonDir) || (await fs.lstat(record.commonDir)).isSymbolicLink()) fail('IDENTITY_MISMATCH', 'The Git common directory changed identity.');
    const directory = path.join(record.commonDir, 'dsh-worktrees');
    if (create) await fs.mkdir(directory, { recursive: true });
    const directoryStat = await fs.lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('IDENTITY_MISMATCH', 'The worktree ownership directory is unsafe.');
    const target = path.join(directory, `${record.id}.json`);
    if (create && !(await exists(target))) await fs.writeFile(target, `${JSON.stringify(markerOf(record))}\n`, { flag: 'wx', mode: 0o600 });
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_384) fail('IDENTITY_MISMATCH', 'The worktree ownership marker is unsafe.');
    let value;
    try { value = JSON.parse(await fs.readFile(target, 'utf8')); } catch (error) { throw new WorktreeError('IDENTITY_MISMATCH', 'The worktree ownership marker cannot be read.', error); }
    if (JSON.stringify(value) !== JSON.stringify(markerOf(record))) fail('IDENTITY_MISMATCH', 'The worktree ownership marker does not match its saved identity.');
  }

  async _repoGit(record, args, signal, allowed = [0]) {
    return git(record.commonDir, [`--git-dir=${record.commonDir}`, ...args], { signal, allowed });
  }

  async _verify(record, signal) {
    await this._marker(record);
    const root = await canonical(record.managedRoot);
    if (!samePath(root, record.managedRoot) || !samePath(path.dirname(record.path), root)) fail('IDENTITY_MISMATCH', 'The managed worktree parent changed identity.');
    const stat = await fs.lstat(record.path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await canonical(record.path), record.path)) fail('IDENTITY_MISMATCH', 'The managed checkout path changed identity.');
    const gitFile = path.join(record.path, '.git');
    const gitStat = await fs.lstat(gitFile);
    if (!gitStat.isFile() || gitStat.isSymbolicLink() || gitStat.size > 16_384) fail('IDENTITY_MISMATCH', 'The managed checkout Git pointer is unsafe.');
    const pointer = /^gitdir: (.+)\r?\n?$/.exec(await fs.readFile(gitFile, 'utf8'));
    if (!pointer) fail('IDENTITY_MISMATCH', 'The managed checkout Git pointer is invalid.');
    const admin = await canonical(path.resolve(record.path, pointer[1].replace(/\r$/, '')));
    if (!samePath(path.dirname(admin), path.join(record.commonDir, 'worktrees')) || record.gitDir && !samePath(admin, record.gitDir)) fail('IDENTITY_MISMATCH', 'The checkout has a different Git administration directory.');
    const backlink = (await fs.readFile(path.join(admin, 'gitdir'), 'utf8')).replace(/\r?\n$/, '');
    if (!samePath(path.resolve(admin, backlink), gitFile)) fail('IDENTITY_MISMATCH', 'The Git worktree backlink changed.');
    const repo = await repository(record.path, signal);
    if (!samePath(repo.root, record.path) || !samePath(repo.commonDir, record.commonDir)) fail('IDENTITY_MISMATCH', 'The checkout belongs to a different repository.');
    const registered = (await this._repoGit(record, ['worktree', 'list', '--porcelain', '-z'], signal)).stdout.split('\0').some(field => field.startsWith('worktree ') && samePath(field.slice(9), record.path));
    if (!registered) fail('IDENTITY_MISMATCH', 'Git does not register this managed checkout.');
    const sparse = await git(record.path, ['config', '--bool', 'core.sparseCheckout'], { signal, allowed: [0, 1] });
    if (sparse.stdout.trim() === 'true') fail('SPARSE_CHECKOUT', 'Sparse checkouts cannot be snapshotted or managed safely.');
    return admin;
  }

  async _configuredRoot() {
    const config = this.getConfig();
    if (!config || typeof config.directory !== 'string' || !path.isAbsolute(config.directory) || config.directory.includes('\0')) fail('INVALID_CONFIG', 'Worktree directory must be an absolute path.');
    const resolved = path.resolve(config.directory);
    if (samePath(resolved, path.parse(resolved).root)) fail('INVALID_CONFIG', 'A filesystem root cannot be the managed worktree directory.');
    await fs.mkdir(resolved, { recursive: true });
    return canonical(resolved);
  }

  async _allocate(sessionId, workspace, choice, operationId, signal) {
    const inspected = await this._inspect(workspace, signal);
    if (!inspected.isGit || !inspected.head) fail('NO_BASE', 'A committed Git repository is required to create a worktree.');
    const baseRef = choice.baseRef ?? inspected.defaultBase;
    if (baseRef !== 'HEAD' && !inspected.branches.some(branch => branch.ref === baseRef || branch.name === baseRef)) fail('INVALID_BASE', 'The selected source ref is unavailable locally.');
    const branch = inspected.branches.find(item => item.ref === baseRef) ?? inspected.branches.find(item => item.name === baseRef && !item.remote) ?? inspected.branches.find(item => item.name === baseRef);
    const normalizedRef = branch?.ref ?? baseRef;
    const repo = await repository(workspace.path, signal);
    const baseCommit = await commitAt(repo.root, normalizedRef, signal);
    const root = await this._configuredRoot();
    const id = randomUUID();
    const target = path.join(root, `dsh-${id}`);
    if (await exists(target)) fail('OCCUPIED_PATH', 'The allocated worktree path is already occupied.');
    const time = this.now();
    const record = {
      id, workspaceId: workspace.workspaceId, workspaceTitle: workspace.title,
      sourceRoot: repo.root, commonDir: repo.commonDir, managedRoot: root, path: target, originalPath: target,
      gitDir: null, baseRef: normalizedRef, baseCommit, token: randomBytes(32).toString('hex'),
      createdAt: time, lastUsedAt: time, ownerlessAt: time, currentBranch: null, status: 'creating', sessionIds: [sessionId],
      snapshotRef: `refs/dsh-worktrees/snapshots/${id}`, snapshotCommit: null, snapshotPendingCommit: null,
      error: null, materialized: false, archivePending: false, ownerSessionId: sessionId, operationId: operationId ?? null,
    };
    const binding = this._binding(sessionId, workspace, { mode: 'new', baseRef: normalizedRef }, record);
    await this._save(state => {
      this._detachPrevious(state, sessionId);
      state.worktrees[id] = record;
      state.bindings[sessionId] = binding;
    });
    return this._record(id);
  }

  _binding(sessionId, workspace, choice, record) {
    return {
      sessionId, workspaceId: workspace.workspaceId, workspacePath: workspace.path, workspaceTitle: workspace.title,
      mode: choice.mode, ...(choice.mode === 'new' ? { baseRef: record.baseRef } : {}),
      worktreeId: record?.id ?? null, path: record?.path ?? workspace.path,
      preparedAt: this.now(), acceptedAt: null, status: 'pending', error: null,
    };
  }

  _detachPrevious(state, sessionId) {
    const previous = has(state.bindings, sessionId);
    if (previous?.worktreeId) {
      const record = state.worktrees[previous.worktreeId];
      record.sessionIds = record.sessionIds.filter(id => id !== sessionId);
      if (!record.sessionIds.length) record.ownerlessAt = this.now();
    }
  }

  async _finishCreate(record, signal, restore = false) {
    await this._marker(record, !restore);
    const present = await exists(record.path);
    let needsAdd = !present;
    if (present?.isDirectory() && !present.isSymbolicLink() && !restore && !record.materialized && !record.gitDir && (await fs.readdir(record.path)).length === 0) {
      const registered = (await this._repoGit(record, ['worktree', 'list', '--porcelain', '-z'], signal)).stdout.split('\0').some(field => field.startsWith('worktree ') && samePath(field.slice(9), record.path));
      if (registered) fail('IDENTITY_MISMATCH', 'The empty reservation has inconsistent Git administration metadata.');
      needsAdd = true;
    }
    if (needsAdd) {
      if (!samePath(await canonical(record.managedRoot), record.managedRoot)) fail('IDENTITY_MISMATCH', 'The managed directory changed identity.');
      await this._repoGit(record, ['worktree', 'add', '--detach', '--no-checkout', '--', record.path, restore ? record.snapshotRef : record.baseCommit], signal);
    }
    const admin = await this._verify(record, signal);
    const expected = restore ? record.snapshotCommit : record.baseCommit;
    if (await commitAt(record.path, 'HEAD', signal) !== expected) fail('IDENTITY_MISMATCH', 'The incomplete checkout has moved away from its expected commit.');
    await this._save(state => { state.worktrees[record.id].gitDir = admin; });
    record = this._record(record.id);
    await materialize(record, expected, signal);
    await this._save(state => {
      const item = state.worktrees[record.id];
      item.materialized = true;
      item.currentBranch = null;
      item.status = 'ready';
      item.error = null;
      item.lastUsedAt = this.now();
    });
    return this._record(record.id);
  }

  async _publish(sessionId, signal) {
    let binding = has(this.state.bindings, sessionId);
    try {
      signal.throwIfAborted();
      await bounded(this.setDirectory(sessionId, binding.path), signal);
      await this._save(state => {
        const next = state.bindings[sessionId];
        next.status = 'ready';
        next.error = null;
        next.preparedAt = this.now();
        if (next.worktreeId) state.worktrees[next.worktreeId].lastUsedAt = this.now();
      });
    } catch (error) {
      await this._save(state => { state.bindings[sessionId].status = 'error'; state.bindings[sessionId].error = message(error); });
      throw error;
    }
    binding = has(this.state.bindings, sessionId);
    return { binding, ...(binding.worktreeId ? { worktree: this._record(binding.worktreeId) } : {}), requiresRestore: false };
  }

  prepare({ sessionId, workspace, choice = { mode: 'local' }, operationId }, signal) {
    requireIdentifier(sessionId, 'sessionId');
    if (operationId !== undefined) requireIdentifier(operationId, 'operationId');
    return this._run(operationSignal => this._lock(this.sessions, sessionId, async () => {
      operationSignal.throwIfAborted();
      const original = await this._workspace(workspace);
      let binding = has(this.state.bindings, sessionId);
      if (binding && (binding.workspaceId !== original.workspaceId || !samePath(binding.workspacePath, original.path))) fail('WORKSPACE_CHANGED', 'A session cannot change its original workspace membership.');
      let wanted = binding?.acceptedAt !== null && binding?.acceptedAt !== undefined ? selected(binding) : selected(choice);
      if (wanted.mode === 'new' && binding?.acceptedAt == null) {
        const inspected = await this._inspect(original, operationSignal);
        const ref = wanted.baseRef ?? inspected.defaultBase;
        const branch = inspected.branches.find(item => item.ref === ref) ?? inspected.branches.find(item => item.name === ref && !item.remote) ?? inspected.branches.find(item => item.name === ref);
        wanted = { mode: 'new', baseRef: branch?.ref ?? ref };
      }
      const matches = binding && binding.mode === wanted.mode && (wanted.mode === 'local' || binding.baseRef === wanted.baseRef);
      if (!matches) {
        if (wanted.mode === 'local') {
          const next = this._binding(sessionId, original, wanted);
          await this._save(state => { this._detachPrevious(state, sessionId); state.bindings[sessionId] = next; });
        } else {
          let reusable = operationId ? Object.values(this.state.worktrees).find(record => record.ownerSessionId === sessionId && record.operationId === operationId) : undefined;
          if (reusable && (reusable.workspaceId !== original.workspaceId || reusable.baseRef !== wanted.baseRef)) fail('OPERATION_CONFLICT', 'This preparation id was already used with a different source.');
          if (reusable) {
            const next = this._binding(sessionId, original, wanted, reusable);
            await this._save(state => {
              this._detachPrevious(state, sessionId);
              if (!state.worktrees[reusable.id].sessionIds.includes(sessionId)) state.worktrees[reusable.id].sessionIds.push(sessionId);
              state.worktrees[reusable.id].ownerlessAt = null;
              state.bindings[sessionId] = next;
            });
          } else await this._allocate(sessionId, original, wanted, operationId, operationSignal);
        }
        binding = has(this.state.bindings, sessionId);
      }
      if (binding.mode === 'local') return this._publish(sessionId, operationSignal);
      const id = binding.worktreeId;
      this.inUse.set(id, (this.inUse.get(id) ?? 0) + 1);
      try {
        return await this._lock(this.records, id, async () => {
          let record = this._record(id);
          if (record.status === 'removed' || record.status === 'missing' || record.materialized && !(await exists(record.path))) {
            if (record.status !== 'removed' && record.status !== 'missing') await this._save(state => { state.worktrees[id].status = 'missing'; });
            return { binding: has(this.state.bindings, sessionId), worktree: this._record(id), requiresRestore: true };
          }
          try {
            if (!record.materialized) record = await this._finishCreate(record, operationSignal, Boolean(record.snapshotCommit));
            else await this._verify(record, operationSignal);
          } catch (error) {
            await this._failure(id, error);
            throw error;
          }
          return this._publish(sessionId, operationSignal);
        });
      } finally {
        const remaining = this.inUse.get(id) - 1;
        if (remaining) this.inUse.set(id, remaining);
        else this.inUse.delete(id);
      }
    }), signal);
  }

  remember({ sessionId, requestId, acceptedAt = this.now() }) {
    requireIdentifier(sessionId, 'sessionId');
    requireIdentifier(requestId, 'requestId');
    if (!Number.isSafeInteger(acceptedAt) || acceptedAt < 0) throw new TypeError('acceptedAt must be a timestamp in milliseconds.');
    return this._run(() => this._save(state => {
      const binding = has(state.bindings, sessionId);
      const key = JSON.stringify([sessionId, requestId]);
      // Queue edits and steering reuse request ids with new timestamps. Receipts must
      // survive archive/restore so these repeats cannot replace newer preferences.
      if (!binding || has(state.accepted, key)) return false;
      if (binding.status !== 'ready') fail('NOT_PREPARED', 'The session directory was not prepared for this accepted message.');
      binding.acceptedAt = Math.max(binding.acceptedAt ?? 0, acceptedAt);
      state.accepted[key] = { sessionId, requestId, acceptedAt };
      const prior = has(state.preferences, binding.workspaceId);
      if (!prior || prior.acceptedAt <= acceptedAt) {
        const choice = selected(binding);
        if (choice.mode === 'local' && prior?.baseRef) choice.baseRef = prior.baseRef;
        state.preferences[binding.workspaceId] = { ...choice, sessionId, requestId, acceptedAt };
      }
      if (binding.worktreeId) {
        state.worktrees[binding.worktreeId].lastUsedAt = Math.max(state.worktrees[binding.worktreeId].lastUsedAt, acceptedAt);
        state.worktrees[binding.worktreeId].ownerlessAt = null;
      }
      return true;
    }));
  }

  bindInheritedSession(childId, parentId, workspace, actualDirectory, signal) {
    requireIdentifier(childId, 'childId');
    requireIdentifier(parentId, 'parentId');
    return this._run(operationSignal => this._lock(this.sessions, childId, async () => {
      if (has(this.state.bindings, childId)) return has(this.state.bindings, childId);
      const parent = has(this.state.bindings, parentId);
      if (!parent?.worktreeId) return undefined;
      const record = this._record(parent.worktreeId);
      const actual = await canonical(actualDirectory);
      if (!inside(record.path, actual)) return undefined;
      await this._verify(record, operationSignal);
      const original = await this._workspace(workspace);
      const binding = this._binding(childId, original, selected(parent), record);
      binding.status = 'ready';
      // Inheritance is fixed immediately; it is not an accepted user message or a remembered preference.
      binding.acceptedAt = parent.acceptedAt ?? this.now();
      await this._save(state => {
        state.bindings[childId] = binding;
        state.worktrees[record.id].sessionIds.push(childId);
      });
      return has(this.state.bindings, childId);
    }), signal);
  }

  assertAvailable(sessionId, signal) {
    requireIdentifier(sessionId, 'sessionId');
    return this._run(async operationSignal => {
      const binding = has(this.state.bindings, sessionId);
      if (!binding?.worktreeId) return binding;
      const record = this._record(binding.worktreeId);
      if (['removed', 'missing'].includes(record.status) || !(await exists(record.path))) fail('RESTORE_REQUIRED', 'Restore this managed worktree before continuing the session.');
      if (!record.materialized) fail('INCOMPLETE_CHECKOUT', 'The managed worktree has not finished preparation.');
      await this._verify(record, operationSignal);
      return binding;
    }, signal);
  }

  _ownerless(record) {
    return !record.sessionIds.some(id => has(this.state.bindings, id)?.acceptedAt != null);
  }

  async _protection(record, signal, automatic = false) {
    const reasons = [];
    if (this.inUse.has(record.id)) reasons.push('pending');
    if (['creating', 'restoring', 'snapshotting', 'removing'].includes(record.status)) reasons.push('pending');
    if (automatic && this.now() - record.createdAt < NEWBORN_GRACE) reasons.push('newborn');
    if (automatic && this._ownerless(record) && this.now() - (record.ownerlessAt ?? record.createdAt) < OWNER_GRACE) reasons.push('ownerless-grace');
    const external = await bounded(this.isProtected(record), signal);
    if (external === true) reasons.push('protected');
    else if (Array.isArray(external)) reasons.push(...external.map(String));
    else if (external !== false) fail('PROTECTION_FAILED', 'The protection callback returned an invalid result.');
    return [...new Set(reasons)];
  }

  async _snapshotRef(record, signal) {
    const result = await this._repoGit(record, ['rev-parse', '--verify', '--end-of-options', `${record.snapshotRef}^{commit}`], signal, [0, 128]);
    return result.code === 0 ? result.stdout.trim() : null;
  }

  async _archive(record, signal) {
    if (!record.archivePending) return;
    try {
      await bounded(this.archiveSessions([...record.sessionIds]), signal);
      await this._save(state => { state.worktrees[record.id].archivePending = false; state.worktrees[record.id].error = null; });
    } catch (error) {
      await this._failure(record.id, error, 'removed');
      throw error;
    }
  }

  async _remove(id, signal, automatic) {
    signal.throwIfAborted();
    let record = this._record(id);
    if (record.status === 'removed') {
      if (!automatic) {
        const protection = await this._protection(record, signal, false);
        if (protection.length) fail('PROTECTED', `The checkout is protected: ${protection.join(', ')}.`);
        if (!record.archivePending) await this._save(state => { state.worktrees[id].archivePending = true; });
        await this._archive(this._record(id), signal);
      }
      return this._record(id);
    }
    const protection = await this._protection(record, signal, automatic);
    if (protection.length) fail('PROTECTED', `The checkout is protected: ${protection.join(', ')}.`);
    try {
      await this._verify(record, signal);
      if (!record.materialized) fail('INCOMPLETE_CHECKOUT', 'The checkout is incomplete and must be recovered before removal.');
      await this._save(state => { state.worktrees[id].status = 'snapshotting'; state.worktrees[id].error = null; });
      const snapshot = await makeSnapshot(record, signal);
      const existingRef = await this._snapshotRef(record, signal);
      if (existingRef !== record.snapshotCommit && !(record.snapshotPendingCommit && existingRef === record.snapshotPendingCommit)) fail('SNAPSHOT_CHANGED', 'The snapshot ref changed outside this manager.');
      await this._save(state => { state.worktrees[id].snapshotPendingCommit = snapshot.commit; });
      await this._repoGit(record, ['update-ref', record.snapshotRef, snapshot.commit, existingRef ?? '0'.repeat(snapshot.commit.length)], signal);
      await this._save(state => {
        state.worktrees[id].snapshotCommit = snapshot.commit;
        state.worktrees[id].snapshotPendingCommit = null;
        state.worktrees[id].status = 'removing';
      });
      record = this._record(id);
      await this._verify(record, signal);
      await assertSnapshotUnchanged(record, snapshot, signal);
      // Recheck external protection after the snapshot, immediately before the destructive Git operation.
      const external = await bounded(this.isProtected(record), signal);
      if (external === true || Array.isArray(external) && external.length) fail('PROTECTED', 'The checkout became protected while it was being snapshotted.');
      if (external !== false && !Array.isArray(external)) fail('PROTECTION_FAILED', 'The protection callback returned an invalid result.');
      if (this.inUse.has(id)) fail('PROTECTED', 'The checkout is being prepared for a session.');
      if (await this._snapshotRef(record, signal) !== snapshot.commit) fail('SNAPSHOT_CHANGED', 'The snapshot ref changed before removal. The checkout was kept.');
      await this._repoGit(record, ['worktree', 'remove', '--force', '--', record.path], signal);
      await this._save(state => {
        const item = state.worktrees[id];
        item.status = 'removed';
        item.error = null;
        item.archivePending = !automatic;
      });
      if (!automatic) await this._archive(this._record(id), signal);
      return this._record(id);
    } catch (error) {
      if (this._record(id).status !== 'removed') await this._failure(id, error);
      throw error;
    }
  }

  remove(worktreeId, signal) {
    return this._run(operationSignal => this._lock(this.records, worktreeId, () => this._remove(worktreeId, operationSignal, false)), signal);
  }

  restore(worktreeId, signal) {
    return this._run(operationSignal => this._lock(this.records, worktreeId, async () => {
      let record = this._record(worktreeId);
      try {
        if (record.status === 'ready') { await this._verify(record, operationSignal); return record; }
        await this._marker(record);
        const snapshot = await this._snapshotRef(record, operationSignal);
        if (!snapshot || snapshot !== record.snapshotCommit && snapshot !== record.snapshotPendingCommit) fail('NO_SNAPSHOT', 'A verified snapshot is unavailable for this checkout.');
        const present = await exists(record.path);
        if (present && record.status !== 'restoring' && !(record.status === 'error' && !record.materialized && record.snapshotCommit)) fail('OCCUPIED_PATH', 'The original worktree path is occupied. Nothing was overwritten.');
        await this._save(state => {
          const item = state.worktrees[worktreeId];
          item.status = 'restoring';
          item.snapshotCommit = snapshot;
          item.snapshotPendingCommit = null;
          item.materialized = false;
          item.gitDir = null;
          item.error = null;
        });
        record = await this._finishCreate(this._record(worktreeId), operationSignal, true);
        return record;
      } catch (error) {
        await this._failure(worktreeId, error);
        throw error;
      }
    }), signal);
  }

  refresh(signal) {
    return this._run(async operationSignal => {
      for (const record of Object.values(this.state.worktrees)) {
        operationSignal.throwIfAborted();
        if (this.records.has(record.id) || this.inUse.has(record.id)) continue;
        await this._lock(this.records, record.id, async () => {
          try {
            const present = await exists(record.path);
            if (!present) {
              const snapshot = await this._snapshotRef(record, operationSignal);
              await this._save(state => {
                const item = state.worktrees[record.id];
                if (snapshot && (snapshot === item.snapshotCommit || snapshot === item.snapshotPendingCommit)) {
                  item.snapshotCommit = snapshot;
                  item.snapshotPendingCommit = null;
                }
                if (item.status !== 'removed') item.status = !item.materialized && !item.snapshotCommit ? 'creating' : 'missing';
              });
              return;
            }
            const admin = await this._verify(record, operationSignal);
            const branch = await git(record.path, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { signal: operationSignal, allowed: [0, 1] });
            await this._save(state => {
              const item = state.worktrees[record.id];
              item.gitDir = admin;
              item.currentBranch = branch.code === 0 ? branch.stdout.trim() : null;
              if (item.materialized && !['removed', 'error'].includes(item.status)) item.status = 'ready';
            });
          } catch (error) {
            operationSignal.throwIfAborted();
            await this._failure(record.id, error);
          }
        });
      }
      return this.list();
    }, signal);
  }

  cleanup() {
    if (this.cleaning) return Promise.resolve({ status: 'busy', eligible: 0, retained: 0, removed: [], skipped: [], errors: [], remaining: 0 });
    this.cleaning = true;
    return this._run(async lifetimeSignal => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new WorktreeError('CLEANUP_TIMEOUT', 'Background cleanup reached its time limit.')), CLEANUP_TIME);
      timer.unref();
      const signal = AbortSignal.any([lifetimeSignal, controller.signal]);
      const report = { status: 'complete', eligible: 0, retained: 0, removed: [], skipped: [], errors: [], remaining: 0, skippedCount: 0, errorCount: 0 };
      const skipped = item => { report.skippedCount++; if (report.skipped.length < 100) report.skipped.push(item); };
      const failed = item => { report.errorCount++; if (report.errors.length < 100) report.errors.push(item); };
      try {
        const config = this.getConfig();
        const maximum = config.maxRetained ?? 15;
        if (!Number.isSafeInteger(maximum) || maximum < 1) fail('INVALID_CONFIG', 'maxRetained must be a positive integer.');
        const candidates = [];
        for (const record of Object.values(this.state.worktrees)) {
          if (!record.materialized || ['removed', 'missing'].includes(record.status)) continue;
          try {
            const reasons = await this._protection(record, signal, true);
            if (reasons.length) skipped({ id: record.id, reasons });
            else candidates.push(record);
          } catch (error) {
            failed({ id: record.id, message: message(error) });
            if (signal.aborted) break;
          }
        }
        candidates.sort((a, b) => {
          const aOwnerless = this._ownerless(a);
          const bOwnerless = this._ownerless(b);
          if (aOwnerless !== bOwnerless) return aOwnerless ? -1 : 1;
          return (aOwnerless ? a.createdAt - b.createdAt : a.lastUsedAt - b.lastUsedAt) || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
        });
        report.eligible = candidates.length;
        const excess = Math.max(0, candidates.length - maximum);
        for (const record of candidates.slice(0, Math.min(excess, CLEANUP_LIMIT))) {
          if (signal.aborted) break;
          try {
            await bounded(this._lock(this.records, record.id, () => this._remove(record.id, signal, true)), signal);
            report.removed.push(record.id);
          } catch (error) {
            failed({ id: record.id, message: message(error) });
          }
        }
        report.retained = report.eligible - report.removed.length;
        report.remaining = Math.max(0, report.retained - maximum);
        if (report.errors.length || report.remaining || signal.aborted) report.status = 'partial';
      } catch (error) {
        report.status = 'partial';
        failed({ id: null, message: message(error) });
      } finally {
        clearTimeout(timer);
      }
      return report;
    }).finally(() => { this.cleaning = false; });
  }

  async dispose() {
    this.lifetime.abort(new WorktreeError('DISPOSED', 'The worktree manager was disposed.'));
    await Promise.allSettled([...this.pending, ...this.records.values(), ...this.sessions.values()]);
    await this.writes.catch(() => {});
  }
}
