import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LinkedWorktreeDiscovery } from '../discovery.js';
import { git as executeGit } from '../lib/git.js';

async function git(directory, args) {
  const result = await executeGit(directory, [
    '-c', 'commit.gpgSign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', ...args,
  ], { timeout: 20_000 });
  return result.stdout.trim();
}

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

async function fixture(t) {
  const temporaryRoot = await fs.realpath(tmpdir());
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'dsh-worktrees-discovery-'));
  const proof = randomUUID();
  await fs.writeFile(path.join(root, '.fixture-owned'), proof, { flag: 'wx' });
  const instances = [];
  t.after(async () => {
    for (const instance of instances) instance.dispose();
    const resolved = path.resolve(root);
    assert.equal(path.isAbsolute(resolved), true);
    assert.equal(path.dirname(resolved), temporaryRoot);
    assert.match(path.basename(resolved), /^dsh-worktrees-discovery-/);
    assert.equal(await fs.readFile(path.join(resolved, '.fixture-owned'), 'utf8'), proof);
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  });
  const source = path.join(root, 'source');
  const linked = path.join(root, 'linked');
  const plain = path.join(root, 'plain');
  await fs.mkdir(source);
  await fs.mkdir(plain);
  await git(source, ['init', '--initial-branch=main']);
  await fs.writeFile(path.join(source, 'tracked.txt'), 'fixture\n');
  await git(source, ['add', '--force', 'tracked.txt']);
  await git(source, ['commit', '-m', 'initial']);
  await git(source, ['worktree', 'add', '-b', 'feature', linked]);
  let rows = [];
  let workspaces = [];
  let lists = 0;
  const context = {
    sessionController: { list: async (request, signal) => {
      assert.deepEqual(request, {});
      signal.throwIfAborted();
      lists += 1;
      return { items: rows };
    } },
    workspaceRegistry: { list: () => workspaces },
  };
  const create = options => {
    const instance = new LinkedWorktreeDiscovery(context, options);
    instances.push(instance);
    return instance;
  };
  return { root, source, linked, plain, context, create,
    setRows: value => { rows = value; },
    setWorkspaces: value => { workspaces = value; },
    lists: () => lists,
  };
}

const emptyState = () => ({ bindings: {} });

function row(sessionId, cwd, workingDirectory) {
  return { sessionId, cwd, ...(workingDirectory === undefined ? {} : { projections: { values: { workingDirectory } } }) };
}

test('main, missing, non-Git and invalid directories do not receive linked-worktree records', async t => {
  const f = await fixture(t);
  f.setRows([
    row('main', f.source), row('plain', f.plain), row('missing', path.join(f.root, 'absent')),
    row('relative', '.'), row('nul', `${f.linked}\0invalid`), row('bad-projection', f.linked, null),
  ]);
  const discovery = f.create();
  assert.deepEqual(discovery.snapshot(), { records: [], diagnostics: [] });
  assert.deepEqual(await discovery.refresh(emptyState()), { records: [], diagnostics: [] });
});

test('effective and nested directories identify one linked checkout without changing Git state', async t => {
  const f = await fixture(t);
  const nested = path.join(f.linked, 'nested', 'directory');
  await fs.mkdir(nested, { recursive: true });
  f.setRows([row('live', f.source, nested), row('cold', f.linked), row('duplicate-path', f.linked)]);
  f.setWorkspaces([{ id: 'workspace-1', path: f.source, title: 'Source repository', sessionIds: ['live', 'cold', 'duplicate-path'] }]);
  const head = await git(f.linked, ['rev-parse', 'HEAD']);
  const refs = await git(f.source, ['show-ref']);
  const worktrees = await git(f.source, ['worktree', 'list', '--porcelain']);
  const index = await fs.readFile(path.join(f.source, '.git', 'index'));
  const discovery = f.create();
  const value = await discovery.refresh(emptyState());
  assert.equal(value.records.length, 1);
  assert.deepEqual(value.diagnostics, []);
  assert.deepEqual(value.records[0], {
    id: value.records[0].id, path: await fs.realpath(f.linked), currentBranch: 'feature', head,
    baseRef: null, status: 'ready', external: true,
    sessionIds: ['live', 'cold', 'duplicate-path'], workspaceId: 'workspace-1', workspaceTitle: 'Source repository',
  });
  assert.match(value.records[0].id, /^external:[a-f0-9]{64}$/);
  assert.equal(discovery.snapshot(), value);
  assert.equal(Object.isFrozen(value.records[0].sessionIds), true);
  assert.equal(await git(f.source, ['show-ref']), refs);
  assert.equal(await git(f.source, ['worktree', 'list', '--porcelain']), worktrees);
  assert.deepEqual(await fs.readFile(path.join(f.source, '.git', 'index')), index);
  assert.equal(await git(f.linked, ['status', '--porcelain']), '');
});

test('detached linked checkouts remain identifiable without inventing a base branch', async t => {
  const f = await fixture(t);
  const detached = path.join(f.root, 'detached');
  await git(f.source, ['worktree', 'add', '--detach', detached, 'HEAD']);
  f.setRows([row('branched', f.linked), row('detached', detached)]);
  const { records, diagnostics } = await f.create().refresh(emptyState());
  assert.equal(records.length, 2);
  assert.deepEqual(diagnostics, []);
  const result = records.find(record => record.sessionIds.includes('detached'));
  assert.equal(result.currentBranch, null);
  assert.equal(result.baseRef, null);
  assert.equal(result.head, await git(detached, ['rev-parse', 'HEAD']));
  assert.notEqual(records[0].id, records[1].id);
});

test('managed bindings are excluded while local bindings in external checkouts stay observable', async t => {
  const f = await fixture(t);
  f.setRows([row('managed', f.linked), row('ordinary', f.linked), row('local', f.linked)]);
  const state = { bindings: {
    managed: { sessionId: 'managed', mode: 'new', worktreeId: 'owned' },
    local: { sessionId: 'local', mode: 'local', worktreeId: null },
  } };
  const before = structuredClone(state);
  const discovery = f.create();
  assert.deepEqual((await discovery.refresh(state)).records[0].sessionIds, ['ordinary', 'local']);
  assert.deepEqual(state, before);
  const next = { bindings: { ...state.bindings,
    ordinary: { sessionId: 'ordinary', mode: 'new', worktreeId: 'owned' },
    local: { sessionId: 'local', mode: 'new', worktreeId: 'owned' },
  } };
  const pending = discovery.refresh(next);
  assert.deepEqual(discovery.snapshot().records, []);
  assert.deepEqual((await pending).records, []);
});

test('shared directories use cached inspection until invalidation and preserve their stable identity', async t => {
  const f = await fixture(t);
  f.setRows([row('one', f.linked), row('two', f.linked)]);
  const discovery = f.create();
  const first = await discovery.refresh(emptyState());
  await git(f.linked, ['switch', '-c', 'changed']);
  f.setRows([row('two', f.linked)]);
  const cached = await discovery.refresh(emptyState());
  assert.equal(cached.records[0].currentBranch, 'feature');
  assert.deepEqual(cached.records[0].sessionIds, ['two']);
  discovery.invalidate();
  const changed = await discovery.refresh(emptyState());
  assert.equal(changed.records[0].currentBranch, 'changed');
  assert.equal(changed.records[0].id, first.records[0].id);
  assert.equal(f.lists(), 3);
});

test('cache hits retain recently used directories at capacity', async t => {
  const f = await fixture(t);
  t.mock.method(Date, 'now', () => 1000);
  const cold = path.join(f.root, 'cold');
  await git(f.source, ['worktree', 'add', '-b', 'cold', cold]);
  const discovery = f.create({ maxDirectories: 2 });
  const branch = async directory => {
    f.setRows([row('one', directory)]);
    return (await discovery.refresh(emptyState())).records[0]?.currentBranch ?? null;
  };
  assert.equal(await branch(f.linked), 'feature');
  assert.equal(await branch(cold), 'cold');
  await git(f.linked, ['switch', '-c', 'hot-changed']);
  await git(cold, ['switch', '-c', 'cold-changed']);
  assert.equal(await branch(f.linked), 'feature');
  assert.equal(await branch(f.plain), null);
  assert.equal(await branch(f.linked), 'feature');
  assert.equal(await branch(cold), 'cold-changed');
});

test('cache refreshes move expired directories to the most recent position', async t => {
  const f = await fixture(t);
  let time = 1000;
  t.mock.method(Date, 'now', () => time);
  const discovery = f.create({ cacheMs: 100, maxDirectories: 2 });
  const branch = async directory => {
    f.setRows([row('one', directory)]);
    return (await discovery.refresh(emptyState())).records[0]?.currentBranch ?? null;
  };
  assert.equal(await branch(f.linked), 'feature');
  time = 1050;
  assert.equal(await branch(f.source), null);
  await git(f.linked, ['switch', '-c', 'refreshed']);
  time = 1101;
  assert.equal(await branch(f.linked), 'refreshed');
  await git(f.linked, ['switch', '-c', 'later']);
  assert.equal(await branch(f.plain), null);
  assert.equal(await branch(f.linked), 'refreshed');
});

test('cache hits do not extend metadata expiry', async t => {
  const f = await fixture(t);
  let time = 1000;
  t.mock.method(Date, 'now', () => time);
  const discovery = f.create({ cacheMs: 100 });
  f.setRows([row('one', f.linked)]);
  assert.equal((await discovery.refresh(emptyState())).records[0].currentBranch, 'feature');
  await git(f.linked, ['switch', '-c', 'later']);
  time = 1050;
  assert.equal((await discovery.refresh(emptyState())).records[0].currentBranch, 'feature');
  time = 1100;
  assert.equal((await discovery.refresh(emptyState())).records[0].currentBranch, 'later');
});

test('expired metadata is inspected again on the next refresh', async t => {
  const f = await fixture(t);
  f.setRows([row('one', f.linked)]);
  const discovery = f.create({ cacheMs: 0 });
  assert.equal((await discovery.refresh(emptyState())).records[0].currentBranch, 'feature');
  await git(f.linked, ['switch', '-c', 'later']);
  assert.equal((await discovery.refresh(emptyState())).records[0].currentBranch, 'later');
});

test('concurrent callers share discovery and use the latest managed exclusions', async t => {
  const f = await fixture(t);
  const waiting = deferred();
  let reads = 0;
  f.context.sessionController.list = async () => { reads += 1; return waiting.promise; };
  const discovery = f.create();
  const first = discovery.refresh(emptyState());
  const second = discovery.refresh({ bindings: { owned: { sessionId: 'owned', mode: 'new', worktreeId: 'owned-tree' } } });
  assert.equal(reads, 1);
  waiting.resolve({ items: [row('owned', f.linked), row('other', f.linked)] });
  const values = await Promise.all([first, second]);
  assert.equal(values[0], values[1]);
  assert.deepEqual(values[0].records[0].sessionIds, ['other']);
});

test('unexpected Git failures produce diagnostics instead of a badge or silent absence', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.source, '.git', 'config'), '[invalid\n');
  f.setRows([row('broken', f.linked)]);
  const { records, diagnostics } = await f.create().refresh(emptyState());
  assert.deepEqual(records, []);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'GIT_FAILED');
  assert.equal(diagnostics[0].path, f.linked);
  assert.deepEqual(diagnostics[0].sessionIds, ['broken']);
  assert.match(diagnostics[0].message, /bad config line/i);
});

test('directory scan limits are reported with the bounded partial result', async t => {
  const f = await fixture(t);
  f.setRows([row('first', f.linked), row('second', f.source)]);
  const { records, diagnostics } = await f.create({ maxDirectories: 1 }).refresh(emptyState());
  assert.deepEqual(records[0].sessionIds, ['first']);
  assert.equal(diagnostics[0].code, 'DISCOVERY_LIMIT');
  assert.match(diagnostics[0].message, /1 of 2/);
});

test('cancelling one waiter does not cancel another caller of the shared scan', async t => {
  const f = await fixture(t);
  const waiting = deferred();
  let scanSignal;
  f.context.sessionController.list = async (_request, signal) => { scanSignal = signal; return waiting.promise; };
  const discovery = f.create();
  const firstController = new AbortController();
  const first = discovery.refresh(emptyState(), firstController.signal);
  const firstRejected = assert.rejects(first, error => error.name === 'AbortError');
  const second = discovery.refresh(emptyState());
  firstController.abort();
  await firstRejected;
  assert.equal(scanSignal.aborted, false);
  waiting.resolve({ items: [row('one', f.linked)] });
  assert.equal((await second).records.length, 1);
});

test('cancelling the last waiter aborts discovery without publishing a late result', async t => {
  const f = await fixture(t);
  const waiting = deferred();
  let scanSignal;
  f.context.sessionController.list = async (_request, signal) => { scanSignal = signal; return waiting.promise; };
  const discovery = f.create();
  const controller = new AbortController();
  const result = discovery.refresh(emptyState(), controller.signal);
  const rejected = assert.rejects(result, error => error.name === 'AbortError');
  controller.abort();
  await rejected;
  assert.equal(scanSignal.aborted, true);
  waiting.resolve({ items: [row('one', f.linked)] });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(discovery.snapshot().records, []);
});

test('an already cancelled request never reads native sessions', async t => {
  const f = await fixture(t);
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => f.create().refresh(emptyState(), controller.signal), error => error.name === 'AbortError');
  assert.equal(f.lists(), 0);
});

test('disposal stops a pending scan and rejects further refreshes', async t => {
  const f = await fixture(t);
  const waiting = deferred();
  let scanSignal;
  f.context.sessionController.list = async (_request, signal) => { scanSignal = signal; return waiting.promise; };
  const discovery = f.create();
  const result = discovery.refresh(emptyState());
  discovery.dispose();
  assert.equal(scanSignal.aborted, true);
  waiting.resolve({ items: [row('one', f.linked)] });
  await assert.rejects(result, error => error.code === 'DISCOVERY_INVALIDATED');
  await assert.rejects(discovery.refresh(emptyState()), error => error.code === 'DISCOVERY_DISPOSED');
  assert.deepEqual(discovery.snapshot(), { records: [], diagnostics: [] });
});

test('the scan deadline rejects even when the native session-list promise ignores cancellation', async t => {
  const waiting = deferred();
  let scanSignal;
  const discovery = new LinkedWorktreeDiscovery({
    sessionController: { list: async (_request, signal) => { scanSignal = signal; return waiting.promise; } },
    workspaceRegistry: { list: () => [] },
  }, { scanTimeoutMs: 20 });
  // Keep the fixture alive while the production deadline timer is intentionally unref'ed.
  const timer = setTimeout(() => waiting.resolve({ items: [] }), 1000);
  t.after(() => { clearTimeout(timer); waiting.resolve({ items: [] }); discovery.dispose(); });
  await assert.rejects(discovery.refresh(emptyState()), error => error.code === 'DISCOVERY_TIMEOUT');
  assert.equal(scanSignal.aborted, true);
  assert.deepEqual(discovery.snapshot(), { records: [], diagnostics: [] });
});

test('native list failures reject visibly while retaining the last completed snapshot', async t => {
  const f = await fixture(t);
  f.setRows([row('one', f.linked)]);
  const discovery = f.create();
  const before = await discovery.refresh(emptyState());
  const failure = new Error('session storage unavailable');
  f.context.sessionController.list = async () => { throw failure; };
  await assert.rejects(discovery.refresh(emptyState()), error => error === failure);
  assert.equal(discovery.snapshot(), before);
});
