import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { createInitialState, validateState, WorktreeManager } from '../lib/manager.js';
import { safeChild } from '../lib/git.js';

const execute = promisify(execFile);

test('local checkout never interprets a branch ref as an option', async t => {
  const f = await fixture(t);
  await git(f.source, ['update-ref', 'refs/heads/-f', 'HEAD']);
  const file = path.join(f.source, 'tracked.txt');
  await fs.writeFile(file, 'keep my local changes\n');
  await assert.rejects(f.manager.checkout(f.workspace, 'refs/heads/-f'), error => error.code === 'INVALID_BRANCH');
  assert.equal(await fs.readFile(file, 'utf8'), 'keep my local changes\n');
  assert.equal(await git(f.source, ['symbolic-ref', '--short', 'HEAD']), 'main');
});

test('raw checkout paths reject NTFS streams, device names, and Git metadata aliases', { skip: process.platform !== 'win32' }, () => {
  const root = path.join(tmpdir(), 'path-validation-only');
  for (const name of ['file:stream', '.git:stream', 'nested/NUL', 'CON.txt', 'CONOUT$', 'COM¹.log', 'COM1.log', 'file.', 'folder /file', '.GiT/config', '../outside']) {
    assert.throws(() => safeChild(root, name), error => error.code === 'UNSAFE_TREE');
  }
  assert.equal(safeChild(root, 'nested/ordinary.txt'), path.join(root, 'nested', 'ordinary.txt'));
});

async function git(directory, args, options = {}) {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  const result = await execute('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', ...args], {
    cwd: directory, windowsHide: true, timeout: 20_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...environment, GIT_TERMINAL_PROMPT: '0', ...options.env }, encoding: options.binary ? 'buffer' : 'utf8',
  });
  return options.binary ? result.stdout : result.stdout.trim();
}

async function present(target) {
  try { await fs.lstat(target); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function fixture(t, options = {}) {
  const temporaryRoot = await fs.realpath(tmpdir());
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'dsh-worktrees-test-'));
  const proof = randomUUID();
  const marker = path.join(root, '.fixture-owned');
  await fs.writeFile(marker, proof, { flag: 'wx' });
  const managers = [];
  t.after(async () => {
    await Promise.all(managers.map(item => item.dispose()));
    const resolved = path.resolve(root);
    assert.equal(path.isAbsolute(resolved), true);
    assert.equal(path.dirname(resolved), temporaryRoot);
    assert.match(path.basename(resolved), /^dsh-worktrees-test-/);
    assert.equal(await fs.readFile(path.join(resolved, '.fixture-owned'), 'utf8'), proof);
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  });
  const source = path.join(root, 'source');
  await fs.mkdir(source);
  await git(source, ['init', '--initial-branch=main']);
  await fs.writeFile(path.join(source, 'tracked.txt'), 'original\n');
  await fs.writeFile(path.join(source, '.gitignore'), 'ignored/\nignored.txt\n');
  await git(source, ['add', '--all']);
  await git(source, ['commit', '-m', 'initial']);
  let state = createInitialState();
  let time = Date.now();
  let writeCount = 0;
  let writeFailure;
  const changes = [];
  const archives = [];
  const protections = new Map();
  const config = { directory: path.join(root, 'managed'), maxRetained: 15 };
  const workspace = { workspaceId: 'workspace-1', path: source, title: 'Fixture repository' };
  const storage = {
    get: () => state,
    set: async next => {
      writeCount++;
      if (writeFailure?.(next, writeCount)) throw new Error('fixture storage failure');
      state = structuredClone(next);
    },
  };
  const build = overrides => {
    const manager = new WorktreeManager({
      storage, getConfig: () => config, now: () => time,
      setDirectory: async (sessionId, directory) => { changes.push({ sessionId, directory }); },
      isProtected: async record => protections.get(record.id) ?? false,
      archiveSessions: async ids => { archives.push(ids); },
      ...options, ...overrides,
    });
    managers.push(manager);
    return manager;
  };
  const manager = build();
  return {
    root, source, workspace, manager, config, storage, changes, archives, protections, build,
    state: () => state,
    advance: amount => { time += amount; },
    failWrites: predicate => { writeFailure = predicate; },
    async create(sessionId, accept = true, activeManager = manager) {
      const result = await activeManager.prepare({ sessionId, workspace, choice: { mode: 'new', baseRef: 'refs/heads/main' } });
      if (accept) await activeManager.remember({ sessionId, requestId: `request-${sessionId}`, acceptedAt: time });
      return result.worktree;
    },
  };
}

test('validates immutable aggregate state and all supported lifecycle statuses', async t => {
  const f = await fixture(t);
  const record = await f.create('one');
  for (const status of ['creating', 'ready', 'snapshotting', 'removing', 'removed', 'restoring', 'missing', 'error']) {
    const state = structuredClone(f.manager.list());
    state.worktrees[record.id].status = status;
    assert.equal(validateState(state).worktrees[record.id].status, status);
  }
  const clone = validateState(f.manager.list());
  clone.worktrees[record.id].error = 'independent';
  assert.equal(f.manager.list().worktrees[record.id].error, null);
  assert.throws(() => { f.manager.list().worktrees[record.id].path = f.source; }, TypeError);
  for (const mutate of [
    value => { value.version = 2; },
    value => { value.worktrees[record.id].path = f.source; },
    value => { value.worktrees[record.id].snapshotRef = 'refs/heads/main'; },
    value => { value.worktrees[record.id].status = 'unknown'; },
    value => { value.bindings.one.worktreeId = 'missing'; },
  ]) {
    const invalid = structuredClone(f.manager.list());
    mutate(invalid);
    assert.throws(() => validateState(invalid), TypeError);
  }
});

test('inspecting or selecting local does not create a worktree or remember a preference', async t => {
  const f = await fixture(t);
  const inspection = await f.manager.inspectWorkspace(f.workspace);
  assert.equal(inspection.defaultBase, 'refs/heads/main');
  assert.equal(inspection.currentBranch, 'main');
  assert.deepEqual(inspection.choice, { mode: 'local' });
  assert.deepEqual(f.manager.list().worktrees, {});
  assert.equal(await present(f.config.directory), false);
  const ordinary = path.join(f.root, 'ordinary');
  await fs.mkdir(ordinary);
  const workspace = { workspaceId: 'ordinary', path: ordinary, title: '' };
  assert.equal((await f.manager.inspectWorkspace(workspace)).isGit, false);
  const local = await f.manager.prepare({ sessionId: 'local', workspace, choice: { mode: 'local' } });
  assert.equal(local.binding.path, ordinary);
  assert.deepEqual(f.manager.list().preferences, {});
  assert.equal(await f.manager.remember({ sessionId: 'local', requestId: 'first', acceptedAt: 200 }), true);
  assert.equal(await f.manager.remember({ sessionId: 'local', requestId: 'first', acceptedAt: 300 }), false);
  assert.equal(f.manager.list().preferences.ordinary.acceptedAt, 200);
});

test('defaults origin HEAD, sole remote HEAD, main, master, current; prefers matching local refs', async t => {
  const f = await fixture(t);
  const head = await git(f.source, ['rev-parse', 'HEAD']);
  await git(f.source, ['branch', 'release']);
  await git(f.source, ['branch', 'stable']);
  await git(f.source, ['update-ref', 'refs/remotes/origin/release', head]);
  await git(f.source, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/release']);
  await git(f.source, ['update-ref', 'refs/remotes/upstream/stable', head]);
  await git(f.source, ['symbolic-ref', 'refs/remotes/upstream/HEAD', 'refs/remotes/upstream/stable']);
  assert.equal((await f.manager.inspectWorkspace(f.workspace)).defaultBase, 'refs/heads/release');
  await git(f.source, ['symbolic-ref', '--delete', 'refs/remotes/origin/HEAD']);
  assert.equal((await f.manager.inspectWorkspace(f.workspace)).defaultBase, 'refs/heads/stable');
  await git(f.source, ['symbolic-ref', '--delete', 'refs/remotes/upstream/HEAD']);
  assert.equal((await f.manager.inspectWorkspace(f.workspace)).defaultBase, 'refs/heads/main');
  await git(f.source, ['checkout', '-b', 'feature']);
  await git(f.source, ['branch', 'master']);
  await git(f.source, ['branch', '-D', 'main']);
  assert.equal((await f.manager.inspectWorkspace(f.workspace)).defaultBase, 'refs/heads/master');
  await git(f.source, ['branch', '-D', 'master']);
  assert.equal((await f.manager.inspectWorkspace(f.workspace)).defaultBase, 'refs/heads/feature');
});

test('first send creates one detached checkout, retries reuse it and accepted followups stay bound', async t => {
  let rejectDirectory = true;
  const actual = [];
  const f = await fixture(t, { setDirectory: async (sessionId, directory) => {
    if (rejectDirectory) throw new Error('directory unavailable');
    actual.push({ sessionId, directory });
  } });
  await fs.writeFile(path.join(f.source, 'tracked.txt'), 'source is dirty\n');
  const beforeBranches = await git(f.source, ['for-each-ref', '--format=%(refname)', 'refs/heads/']);
  const request = { sessionId: 'one', workspace: f.workspace, choice: { mode: 'new', baseRef: 'main' }, operationId: 'send-1' };
  await assert.rejects(f.manager.prepare(request), /directory unavailable/);
  const [saved] = Object.values(f.manager.list().worktrees);
  assert.equal(saved.status, 'ready');
  assert.equal(f.manager.list().bindings.one.status, 'error');
  rejectDirectory = false;
  const restarted = f.build({ setDirectory: async (sessionId, directory) => { actual.push({ sessionId, directory }); } });
  const results = await Promise.all([restarted.prepare(request), restarted.prepare(request)]);
  assert.equal(results[0].worktree.id, saved.id);
  assert.equal(results[1].worktree.id, saved.id);
  assert.equal(Object.keys(restarted.list().worktrees).length, 1);
  assert.equal(await git(saved.path, ['rev-parse', '--abbrev-ref', 'HEAD']), 'HEAD');
  assert.equal(await git(f.source, ['for-each-ref', '--format=%(refname)', 'refs/heads/']), beforeBranches);
  assert.equal(await fs.readFile(path.join(f.source, 'tracked.txt'), 'utf8'), 'source is dirty\n');
  await restarted.remember({ sessionId: 'one', requestId: 'accepted', acceptedAt: 1000 });
  const followup = await restarted.prepare({ ...request, choice: { mode: 'local' } });
  assert.equal(followup.binding.path, saved.path);
  assert.equal(restarted.list().bindings.one.workspacePath, f.source);
  assert.equal(restarted.list().preferences['workspace-1'].mode, 'new');
  await assert.rejects(restarted.prepare({ ...request, workspace: { ...f.workspace, workspaceId: 'changed' } }), /original workspace/);
});

test('switching back before acceptance resets cwd and leaves an ownerless managed checkout', async t => {
  const f = await fixture(t);
  const created = await f.create('one', false);
  await f.manager.prepare({ sessionId: 'one', workspace: f.workspace, choice: { mode: 'local' } });
  assert.equal(f.changes.at(-1).directory, f.source);
  assert.deepEqual(f.manager.list().worktrees[created.id].sessionIds, []);
  assert.deepEqual(f.manager.list().preferences, {});
  await f.create('retained');
  f.config.maxRetained = 1;
  f.advance(2 * 60_000);
  const skipped = await f.manager.cleanup();
  assert.ok(skipped.skipped.some(item => item.id === created.id && item.reasons.includes('ownerless-grace')));
  f.advance(61 * 60_000);
  assert.deepEqual((await f.manager.cleanup()).removed, [created.id]);
  assert.deepEqual(f.archives, []);
});

test('local checkout preserves changes or fails without force, stash, hooks, or filter commands', async t => {
  const f = await fixture(t);
  await git(f.source, ['checkout', '-b', 'other']);
  await fs.writeFile(path.join(f.source, 'tracked.txt'), 'other branch\n');
  await git(f.source, ['add', 'tracked.txt']);
  await git(f.source, ['commit', '-m', 'other']);
  await git(f.source, ['checkout', 'main']);
  await fs.writeFile(path.join(f.source, 'tracked.txt'), 'local change\n');
  await assert.rejects(f.manager.checkout(f.workspace, 'other'), /overwritten|local changes/i);
  assert.equal(await git(f.source, ['branch', '--show-current']), 'main');
  assert.equal(await git(f.source, ['stash', 'list']), '');
  assert.equal(await fs.readFile(path.join(f.source, 'tracked.txt'), 'utf8'), 'local change\n');
  await fs.writeFile(path.join(f.source, 'tracked.txt'), 'original\n');
  const hooks = path.join(f.source, '.git', 'hooks');
  await fs.writeFile(path.join(hooks, 'post-checkout'), '#!/bin/sh\necho invoked > hook-ran\n', { mode: 0o755 });
  await git(f.source, ['config', 'filter.fixture.smudge', 'touch filter-ran']);
  await git(f.source, ['config', 'filter.fixture.clean', 'touch filter-ran']);
  await git(f.source, ['config', 'filter.fixture.required', 'true']);
  const checked = await f.manager.checkout(f.workspace, 'refs/heads/other');
  assert.equal(checked.currentBranch, 'other');
  assert.equal(await present(path.join(f.source, 'hook-ran')), false);
  assert.equal(await present(path.join(f.source, 'filter-ran')), false);
});

test('snapshots exact tracked and nonignored untracked bytes and detached ancestry without touching index or stash', async t => {
  const f = await fixture(t);
  const record = await f.create('one');
  await fs.writeFile(path.join(record.path, 'commit.txt'), 'detached commit\n');
  await git(record.path, ['add', 'commit.txt']);
  await git(record.path, ['commit', '-m', 'detached work']);
  const detachedHead = await git(record.path, ['rev-parse', 'HEAD']);
  await fs.writeFile(path.join(record.path, '.gitattributes'), '*.bin text eol=crlf filter=fixture\n');
  await fs.writeFile(path.join(record.path, 'tracked.txt'), 'staged value\n');
  await git(record.path, ['add', 'tracked.txt']);
  const tracked = Buffer.from([0, 255, 13, 10, 42, 128]);
  const untracked = Buffer.from([255, 0, 10, 13, 17]);
  await fs.writeFile(path.join(record.path, 'tracked.txt'), tracked);
  await fs.writeFile(path.join(record.path, 'raw.bin'), untracked);
  await fs.writeFile(path.join(record.path, 'ignored.txt'), 'excluded');
  await git(record.path, ['config', 'filter.fixture.process', 'false']);
  await git(record.path, ['config', 'filter.fixture.required', 'true']);
  const originalIndex = await fs.readFile(path.join(record.gitDir, 'index'));
  let indexAtArchive;
  let snapshotAtArchive;
  const manager = f.build({ archiveSessions: async ids => {
    assert.deepEqual(ids, ['one']);
    snapshotAtArchive = await git(f.source, ['rev-parse', record.snapshotRef]);
    assert.equal(await present(record.path), false);
  } });
  // Observe index bytes at the last protection check, immediately before Git removes its admin directory.
  manager.isProtected = async current => {
    if (current.status === 'removing') indexAtArchive = await fs.readFile(path.join(current.gitDir, 'index'));
    return false;
  };
  const removed = await manager.remove(record.id);
  assert.equal(removed.status, 'removed');
  assert.deepEqual(indexAtArchive, originalIndex);
  assert.equal(await git(f.source, ['stash', 'list']), '');
  assert.equal(await git(f.source, ['rev-parse', `${record.snapshotRef}^`]), detachedHead);
  assert.equal(snapshotAtArchive, removed.snapshotCommit);
  assert.deepEqual(await git(f.source, ['show', `${record.snapshotRef}:raw.bin`], { binary: true }), untracked);
  const restored = await manager.restore(record.id);
  assert.equal(restored.path, record.path);
  assert.equal(await git(record.path, ['rev-parse', 'HEAD']), removed.snapshotCommit);
  assert.deepEqual(await fs.readFile(path.join(record.path, 'tracked.txt')), tracked);
  assert.deepEqual(await fs.readFile(path.join(record.path, 'raw.bin')), untracked);
  assert.equal(await present(path.join(record.path, 'ignored.txt')), false);
  assert.equal(await fs.readFile(path.join(record.path, 'commit.txt'), 'utf8'), 'detached commit\n');
});

test('unchanged cleanup snapshots HEAD and restores only the original unoccupied path', async t => {
  const f = await fixture(t);
  const record = await f.create('one');
  f.advance(1000);
  await f.create('retained');
  f.config.maxRetained = 1;
  f.advance(2 * 60_000);
  assert.deepEqual((await f.manager.cleanup()).removed, [record.id]);
  assert.deepEqual(f.archives, []);
  assert.equal(await git(f.source, ['rev-parse', record.snapshotRef]), record.baseCommit);
  const continuation = await f.manager.prepare({ sessionId: 'one', workspace: f.workspace, choice: { mode: 'local' } });
  assert.equal(continuation.requiresRestore, true);
  assert.equal(f.changes.filter(change => change.sessionId === 'one').at(-1).directory, record.path);
  await assert.rejects(f.manager.assertAvailable('one'), error => error.code === 'RESTORE_REQUIRED');
  await fs.mkdir(record.path);
  await fs.writeFile(path.join(record.path, 'occupant'), 'keep me');
  await assert.rejects(f.manager.restore(record.id), /occupied/);
  assert.equal(await fs.readFile(path.join(record.path, 'occupant'), 'utf8'), 'keep me');
  // Only remove the fixture file and empty directory after proving their exact owned path.
  assert.equal(path.dirname(record.path), f.config.directory);
  await fs.unlink(path.join(record.path, 'occupant'));
  await fs.rmdir(record.path);
  await f.manager.restore(record.id);
  assert.equal((await f.manager.assertAvailable('one')).path, record.path);
});

test('retention counts eligible checkouts and excludes pinned, active, pending, and ownerless newborns', async t => {
  const f = await fixture(t);
  const pinned = await f.create('pinned');
  const busy = await f.create('busy');
  const old = await f.create('old');
  const recent = await f.create('recent');
  const pending = await f.create('pending', false);
  f.protections.set(pinned.id, ['pinned']);
  f.protections.set(busy.id, ['active', 'shared-terminal']);
  f.config.maxRetained = 1;
  f.advance(2 * 60_000);
  await f.manager.remember({ sessionId: 'recent', requestId: 'recent-use', acceptedAt: Date.now() + 500_000 });
  const report = await f.manager.cleanup();
  assert.equal(report.eligible, 2);
  assert.equal(report.retained, 1);
  assert.deepEqual(report.removed, [old.id]);
  assert.equal(await present(recent.path), true);
  assert.ok(report.skipped.some(item => item.id === pending.id && item.reasons.includes('ownerless-grace')));
  await assert.rejects(f.manager.remove(pinned.id), /protected/);
  await assert.rejects(f.manager.remove(busy.id), /protected/);
  assert.deepEqual(f.archives, []);
});

test('creation does not wait for running cleanup and configuration changes affect future paths', async t => {
  const f = await fixture(t);
  const old = await f.create('old');
  f.config.maxRetained = 1;
  f.advance(2 * 60_000);
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const protection = new Promise(resolve => { release = resolve; });
  f.manager.isProtected = async () => { entered(); return protection; };
  const cleanup = f.manager.cleanup();
  await started;
  f.config.directory = path.join(f.root, 'new-managed');
  const created = await f.create('new');
  assert.equal(path.dirname(created.path), f.config.directory);
  assert.notEqual(path.dirname(old.path), path.dirname(created.path));
  assert.equal(await present(created.path), true);
  release(true);
  assert.equal((await cleanup).removed.length, 0);
  assert.equal((await f.manager.cleanup()).status, 'complete');
});

test('embedded repositories, initialized submodules, and unsafe identity preserve the checkout', async t => {
  const f = await fixture(t);
  const nested = await f.create('nested');
  const child = path.join(nested.path, 'ignored', 'child');
  await fs.mkdir(child, { recursive: true });
  await git(child, ['init']);
  await assert.rejects(f.manager.remove(nested.id), /embedded repository|initialized submodule/);
  assert.equal(await present(path.join(child, '.git')), true);
  assert.equal(f.manager.list().worktrees[nested.id].status, 'error');
  assert.deepEqual(f.archives, []);
  const tampered = await f.create('tampered');
  const pointer = await fs.open(path.join(tampered.path, '.git'), 'r+');
  try {
    await pointer.truncate(0);
    await pointer.writeFile(`gitdir: ${path.join(f.source, '.git')}\n`);
  } finally { await pointer.close(); }
  await assert.rejects(f.manager.remove(tampered.id), /administration directory/);
  assert.equal(await present(tampered.path), true);
  assert.equal(await present(path.join(f.source, 'tracked.txt')), true);
});

test('failed metadata after Git creation stays observable and retries reuse the checkout', async t => {
  const f = await fixture(t);
  let rejected = false;
  f.failWrites(next => {
    const record = Object.values(next.worktrees)[0];
    if (!rejected && record?.gitDir && !record.materialized) { rejected = true; return true; }
    return false;
  });
  await assert.rejects(f.create('one', false), /storage failure/);
  const [partial] = Object.values(f.manager.list().worktrees);
  assert.equal(partial.status, 'error');
  assert.equal(await present(path.join(partial.path, '.git')), true);
  f.failWrites(undefined);
  const restarted = f.build();
  await restarted.refresh();
  const result = await restarted.prepare({ sessionId: 'one', workspace: f.workspace, choice: { mode: 'new', baseRef: 'refs/heads/main' } });
  assert.equal(result.worktree.id, partial.id);
  assert.equal(result.worktree.status, 'ready');
  assert.equal(Object.keys(restarted.list().worktrees).length, 1);
});

test('manual deletion archives only after snapshot/removal and failed archive can be retried', async t => {
  const f = await fixture(t);
  const record = await f.create('one');
  let failArchive = true;
  f.manager.archiveSessions = async () => { if (failArchive) throw new Error('archive failed'); };
  await assert.rejects(f.manager.remove(record.id), /archive failed/);
  assert.equal(f.manager.list().worktrees[record.id].status, 'removed');
  assert.equal(f.manager.list().worktrees[record.id].archivePending, true);
  assert.equal(await present(record.path), false);
  assert.equal(await git(f.source, ['rev-parse', record.snapshotRef]), record.baseCommit);
  failArchive = false;
  assert.equal((await f.manager.remove(record.id)).archivePending, false);
});

test('inheritance associates shared checkout only when child cwd matches and preserves workspace identity', async t => {
  const f = await fixture(t);
  const record = await f.create('parent');
  const other = await f.manager.bindInheritedSession('other', 'parent', f.workspace, f.source);
  assert.equal(other, undefined);
  const child = await f.manager.bindInheritedSession('child', 'parent', f.workspace, record.path);
  assert.equal(child.workspacePath, f.source);
  assert.equal(child.path, record.path);
  assert.deepEqual(f.manager.list().worktrees[record.id].sessionIds, ['parent', 'child']);
  assert.equal(Object.keys(f.manager.list().accepted).length, 1);
  f.protections.set(record.id, ['child-active']);
  await assert.rejects(f.manager.remove(record.id), /child-active/);
});

test('accepted-message ordering is per workspace and unrelated callbacks cannot rewrite it', async t => {
  const f = await fixture(t);
  await f.manager.prepare({ sessionId: 'local', workspace: f.workspace, choice: { mode: 'local' } });
  await f.create('new', false);
  await f.manager.remember({ sessionId: 'new', requestId: 'newer', acceptedAt: 200 });
  await f.manager.remember({ sessionId: 'local', requestId: 'older', acceptedAt: 100 });
  assert.equal(f.manager.list().preferences['workspace-1'].mode, 'new');
  await f.manager.remember({ sessionId: 'local', requestId: 'latest', acceptedAt: 300 });
  assert.equal(f.manager.list().preferences['workspace-1'].mode, 'local');
  assert.equal(f.manager.list().preferences['workspace-1'].baseRef, 'refs/heads/main');
  assert.deepEqual((await f.manager.inspectWorkspace(f.workspace)).choice, { mode: 'local', baseRef: 'refs/heads/main' });
  assert.equal(await f.manager.remember({ sessionId: 'unbound', requestId: 'ignored', acceptedAt: 400 }), false);
  assert.equal(f.manager.list().bindings.local.acceptedAt, 300);
});

test('detached sources require an explicit base and Local checkout rejects remote refs', async t => {
  const f = await fixture(t);
  const head = await git(f.source, ['rev-parse', 'HEAD']);
  await git(f.source, ['branch', 'topic']);
  await git(f.source, ['checkout', '--detach']);
  await git(f.source, ['branch', '-D', 'main']);
  await git(f.source, ['update-ref', 'refs/remotes/origin/topic', head]);
  const inspected = await f.manager.inspectWorkspace(f.workspace);
  assert.equal(inspected.currentBranch, null);
  assert.equal(inspected.defaultBase, null);
  await assert.rejects(f.manager.prepare({ sessionId: 'one', workspace: f.workspace, choice: { mode: 'new' } }), /source ref/);
  await assert.rejects(f.manager.checkout(f.workspace, 'refs/remotes/origin/topic'), /existing local branch/);
  const explicit = await f.manager.prepare({ sessionId: 'one', workspace: f.workspace, choice: { mode: 'new', baseRef: 'refs/heads/topic' } });
  assert.equal(explicit.worktree.baseCommit, head);
});

test('Git environment repository selectors cannot redirect creation or snapshot operations', async t => {
  const f = await fixture(t);
  const foreign = path.join(f.root, 'foreign');
  await fs.mkdir(foreign);
  await git(foreign, ['init', '--initial-branch=foreign']);
  await fs.writeFile(path.join(foreign, 'foreign.txt'), 'foreign data');
  await git(foreign, ['add', '--all']);
  await git(foreign, ['commit', '-m', 'foreign']);
  const prior = new Map();
  const poison = {
    GIT_DIR: path.join(foreign, '.git'), GIT_WORK_TREE: foreign, GIT_COMMON_DIR: path.join(foreign, '.git'),
    GIT_INDEX_FILE: path.join(foreign, '.git', 'poison-index'), GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: path.join(foreign, 'hooks'),
  };
  try {
    for (const [key, value] of Object.entries(poison)) { prior.set(key, process.env[key]); process.env[key] = value; }
    const record = await f.create('one');
    assert.equal(record.sourceRoot, f.source);
    assert.equal(await fs.readFile(path.join(record.path, 'tracked.txt'), 'utf8'), 'original\n');
    await f.manager.remove(record.id);
    assert.equal(await present(path.join(foreign, '.git', 'poison-index')), false);
    assert.equal(await fs.readFile(path.join(foreign, 'foreign.txt'), 'utf8'), 'foreign data');
  } finally {
    for (const [key, value] of prior) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('initialized submodules block deletion and remain usable', async t => {
  const f = await fixture(t);
  const record = await f.create('one');
  await git(record.path, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '--', f.source, 'modules/local']);
  await assert.rejects(f.manager.remove(record.id), /initialized submodule|embedded repository/);
  assert.equal(await git(path.join(record.path, 'modules', 'local'), ['rev-parse', 'HEAD']), record.baseCommit);
  assert.equal(await present(record.path), true);
  assert.deepEqual(f.archives, []);
});

test('concurrent independent preparations serialize aggregate writes without losing bindings', async t => {
  const f = await fixture(t);
  let activeWrites = 0;
  let maximumWrites = 0;
  const storage = {
    get: f.storage.get,
    set: async next => {
      activeWrites++;
      maximumWrites = Math.max(maximumWrites, activeWrites);
      try { await new Promise(resolve => setImmediate(resolve)); await f.storage.set(next); }
      finally { activeWrites--; }
    },
  };
  const manager = f.build({ storage });
  const [one, two] = await Promise.all([f.create('one', true, manager), f.create('two', true, manager)]);
  assert.notEqual(one.id, two.id);
  assert.equal(maximumWrites, 1);
  assert.equal(Object.keys(manager.list().bindings).length, 2);
  assert.equal(Object.keys(manager.list().worktrees).length, 2);
  assert.equal(Object.keys(manager.list().accepted).length, 2);
});

test('failed creation before Git mutation recovers after refresh and failed snapshot never archives', async t => {
  const f = await fixture(t);
  const common = path.join(f.source, '.git');
  await fs.writeFile(path.join(common, 'dsh-worktrees'), 'blocked ownership metadata');
  await assert.rejects(f.create('one', false), /EEXIST/);
  const [record] = Object.values(f.manager.list().worktrees);
  assert.equal(await present(record.path), false);
  assert.equal(record.status, 'error');
  await fs.mkdir(record.path);
  assert.equal(path.dirname(path.join(common, 'dsh-worktrees')), common);
  await fs.unlink(path.join(common, 'dsh-worktrees'));
  await f.manager.refresh();
  const recovered = await f.create('one');
  assert.equal(recovered.id, record.id);
  await fs.mkdir(path.join(recovered.path, 'nested'));
  await git(path.join(recovered.path, 'nested'), ['init']);
  f.advance(1000);
  await f.create('retained');
  f.config.maxRetained = 1;
  f.advance(2 * 60_000);
  const report = await f.manager.cleanup();
  assert.equal(report.status, 'partial');
  assert.equal(report.errors.length, 1);
  assert.equal(await present(recovered.path), true);
  assert.deepEqual(f.archives, []);
});

test('each prepared followup advances preparedAt and acceptedAt tracks the latest accepted message', async t => {
  const f = await fixture(t);
  await f.create('one');
  const original = f.manager.list().bindings.one;
  f.advance(1000);
  await f.manager.prepare({ sessionId: 'one', workspace: f.workspace, choice: { mode: 'local' } });
  const prepared = f.manager.list().bindings.one;
  assert.ok(prepared.preparedAt > original.preparedAt);
  assert.equal(prepared.acceptedAt, original.acceptedAt);
  await f.manager.remember({ sessionId: 'one', requestId: 'followup', acceptedAt: prepared.preparedAt + 1 });
  assert.equal(f.manager.list().bindings.one.acceptedAt, prepared.preparedAt + 1);
});

test('the default retention target keeps fifteen eligible worktrees without blocking creation', async t => {
  const f = await fixture(t);
  delete f.config.maxRetained;
  const records = [];
  for (let index = 0; index < 16; index++) {
    records.push(await f.create(`session-${index}`));
    f.advance(1000);
  }
  assert.equal(Object.values(f.manager.list().worktrees).filter(record => record.status === 'ready').length, 16);
  f.advance(2 * 60_000);
  const report = await f.manager.cleanup();
  assert.equal(report.eligible, 16);
  assert.equal(report.retained, 15);
  assert.deepEqual(report.removed, [records[0].id]);
  assert.deepEqual(f.archives, []);
  f.config.maxRetained = 0;
  const invalid = await f.manager.cleanup();
  assert.equal(invalid.status, 'partial');
  assert.match(invalid.errors[0].message, /positive integer/);
  assert.deepEqual(invalid.removed, []);
});

test('failed first sends become eligible after an hour and ownerless worktrees are removed first', async t => {
  const f = await fixture(t);
  const owned = await f.create('owned');
  f.advance(10_000);
  const pending = await f.create('pending', false);
  f.config.maxRetained = 1;
  f.advance(2 * 60_000);
  const young = await f.manager.cleanup();
  assert.deepEqual(young.removed, []);
  assert.ok(young.skipped.some(item => item.id === pending.id && item.reasons.includes('ownerless-grace')));
  f.advance(61 * 60_000);
  const old = await f.manager.cleanup();
  assert.equal(old.eligible, 2);
  assert.deepEqual(old.removed, [pending.id]);
  assert.equal(await present(owned.path), true);
  const retry = await f.manager.prepare({ sessionId: 'pending', workspace: f.workspace, choice: { mode: 'new', baseRef: 'refs/heads/main' } });
  assert.equal(retry.requiresRestore, true);
  assert.equal(retry.worktree.id, pending.id);
  assert.deepEqual(f.archives, []);
});

test('Git-unavailable inspection leaves ordinary Local preparation usable', async t => {
  const f = await fixture(t);
  const key = Object.keys(process.env).find(name => name.toLowerCase() === 'path') ?? 'PATH';
  const previous = process.env[key];
  try {
    process.env[key] = '';
    const inspected = await f.manager.inspectWorkspace(f.workspace);
    assert.equal(inspected.isGit, false);
    assert.equal(inspected.reason, 'git-unavailable');
    const local = await f.manager.prepare({ sessionId: 'one', workspace: f.workspace, choice: { mode: 'local' } });
    assert.equal(local.binding.path, f.source);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});

test('refresh reports a branch created by the user and removal never deletes it', async t => {
  const f = await fixture(t);
  const record = await f.create('one');
  await git(record.path, ['checkout', '-b', 'user-work']);
  await fs.writeFile(path.join(record.path, 'user-work.txt'), 'user branch bytes');
  await git(record.path, ['add', '--all']);
  await git(record.path, ['commit', '-m', 'user branch']);
  const commit = await git(record.path, ['rev-parse', 'HEAD']);
  assert.equal((await f.manager.refresh()).worktrees[record.id].currentBranch, 'user-work');
  await f.manager.remove(record.id);
  assert.equal(await git(f.source, ['rev-parse', 'refs/heads/user-work']), commit);
  assert.equal(await git(f.source, ['rev-parse', record.snapshotRef]), commit);
});

test('dispose aborts pending cleanup and rejects new operations without removing checkouts', async t => {
  const f = await fixture(t);
  const record = await f.create('one');
  f.advance(2 * 60_000);
  let announce;
  const started = new Promise(resolve => { announce = resolve; });
  f.manager.isProtected = async () => { announce(); return new Promise(() => {}); };
  const cleanup = f.manager.cleanup();
  await started;
  await f.manager.dispose();
  assert.equal((await cleanup).status, 'partial');
  assert.equal(await present(record.path), true);
  await assert.rejects(f.manager.prepare({ sessionId: 'two', workspace: f.workspace, choice: { mode: 'new' } }), error => error.code === 'DISPOSED');
  assert.equal(Object.keys(f.manager.list().worktrees).length, 1);
});

test('native symlink targets survive snapshot and restoration without being followed', async t => {
  const f = await fixture(t);
  const record = await f.create('one');
  const link = path.join(record.path, 'link-to-tracked');
  try {
    await fs.symlink('tracked.txt', link, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('The Windows account cannot create native symlinks.');
      return;
    }
    throw error;
  }
  const bytes = await fs.readlink(link, { encoding: 'buffer' });
  await f.manager.remove(record.id);
  assert.deepEqual(await git(f.source, ['show', `${record.snapshotRef}:link-to-tracked`], { binary: true }), bytes);
  await f.manager.restore(record.id);
  assert.equal((await fs.lstat(link)).isSymbolicLink(), true);
  assert.deepEqual(await fs.readlink(link, { encoding: 'buffer' }), bytes);
  assert.equal(await fs.readFile(path.join(record.path, 'tracked.txt'), 'utf8'), 'original\n');
});
