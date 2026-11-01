import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { WorktreeHost, acceptedMessages } from '../host.js';
import { createInitialState } from '../lib/manager.js';
import { registerHostEvents, registerInfoTool, registerManagementTool } from '../index.js';

const execute = promisify(execFile);

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-worktree-bridge-'));
  const marker = randomUUID();
  await fs.writeFile(path.join(root, '.fixture-owned'), marker);
  const source = path.join(root, 'source');
  const pool = path.join(root, 'pool');
  let host;
  t.after(async () => {
    await host?.dispose();
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('dsh-worktree-bridge-'));
    assert.equal(await fs.readFile(path.join(root, '.fixture-owned'), 'utf8'), marker);
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.mkdir(source);
  async function git(...args) {
    return (await execute('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args], { cwd: source })).stdout.trim();
  }
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Worktree tests');
  await git('config', 'user.email', 'worktrees@example.invalid');
  await fs.writeFile(path.join(source, 'file.txt'), 'original\n');
  await git('add', 'file.txt');
  await git('commit', '-m', 'fixture');
  await git('branch', 'other');
  const workspace = { id: 'workspace', path: source, title: 'Fixture', sessionIds: ['session'] };
  const events = [];
  const session = { id: 'session', header: { cwd: source }, snapshotEvents: () => [...events] };
  const agent = { id: 'session', session };
  const warnings = [];
  const calls = [];
  let cwd = source;
  let state = createInitialState();
  let rejectAdmission = false;
  const values = { directory: pool, maxRetained: 15 };
  let revision = 0;
  const ctx = {
    logger: { warn: message => warnings.push(message) },
    agents: { get: id => id === agent.id ? agent : undefined },
    workspaceRegistry: { get: id => id === workspace.id ? workspace : undefined, list: () => [workspace], pinnedSessionIds: [], archiveSession: async id => calls.push(['archive', id]) },
    sessionController: {
      resolveAgent: async id => id === session.id ? { agent } : { error: new Error('Session missing') },
      inspect: async () => ({ meta: session.header, events: [...events] }),
      list: async () => { calls.push(['session-list']); return { items: [] }; },
    },
    workingDirectory: { get: () => cwd, set: async (_agent, directory) => { cwd = await fs.realpath(directory); calls.push(['cwd', cwd]); return cwd; } },
    waterfall: async (_name, _request, next) => next(),
    settings: {
      describe: () => [{ ns: 'worktrees', value: { ...values }, revision }],
      update: async (ns, patch, expected) => { assert.equal(ns, 'worktrees'); assert.equal(expected, revision); Object.assign(values, patch); revision++; },
    },
    get: name => name === 'directoryPicker' ? { capability: () => ({ kind: 'native' }) } : undefined,
  };
  host = new WorktreeHost(ctx, { directory: { get: () => values.directory }, maxRetained: { get: () => values.maxRetained } }, {
    get: () => structuredClone(state),
    set: async value => {
      if (rejectAdmission && Object.keys(value.accepted).length > Object.keys(state.accepted).length) { rejectAdmission = false; throw new Error('Admission metadata disk failure'); }
      state = structuredClone(value);
    },
  });
  const owner = { id: 'peer-a', principal: { kind: 'owner' }, signal: new AbortController().signal };
  const peer = { id: 'peer-b', principal: { kind: 'owner' }, signal: new AbortController().signal };
  const signal = new AbortController().signal;
  const rpc = (endpoint, payload, caller = owner) => host.rpc(endpoint, payload, signal, caller);
  const event = (requestId, sourceKind = 'user') => {
    const value = { type: 'agent/inbox/spliced', seq: events.length, time: Date.now(), data: { inserted: [{ id: `message-${events.length}`, role: 'user', source: { kind: sourceKind, rpcId: requestId }, content: [{ type: 'text', text: 'test' }] }] } };
    events.push(value);
    return value;
  };
  return { host, ctx, rpc, owner, peer, workspace, source, pool, agent, session, events, event, warnings, calls, git, getState: () => state, getCwd: () => cwd, rejectNextAdmission: () => { rejectAdmission = true; } };
}

const newRequest = operationId => ({ sessionId: 'session', operationId, choice: { mode: 'new', baseRef: 'refs/heads/main' } });

test('only durable human inbox insertions count, including queued messages', () => {
  assert.deepEqual(acceptedMessages({ type: 'user/message', seq: 1, time: 100, data: {} }), []);
  assert.deepEqual(acceptedMessages({ type: 'agent/inbox/spliced', seq: 2, time: 200, data: { inserted: [{ id: 'a', source: { kind: 'working-directory' } }, { id: 'b', source: { kind: 'user', rpcId: 'request' } }] } }), [{ requestId: 'request', acceptedAt: 200 }]);
});

test('first send prepares detached cwd, reserves it across tabs, and remembers only admission', async t => {
  const f = await fixture(t);
  const first = await f.rpc('prepare', newRequest('attempt-a'));
  assert.equal(first.ok, true);
  assert.equal(first.value.ready, true);
  assert.equal(f.getCwd(), first.value.actualDirectory);
  assert.notEqual(f.getCwd(), f.source);
  const head = await execute('git', ['symbolic-ref', '--quiet', 'HEAD'], { cwd: f.getCwd() }).then(() => 'named', error => error.code);
  assert.equal(head, 1);
  assert.deepEqual(f.getState().preferences, {});
  const second = await f.rpc('prepare', newRequest('attempt-b'), f.peer);
  assert.equal(second.ok, false);
  assert.equal(second.error.code, 'SEND_IN_PROGRESS');
  assert.equal(Object.keys(f.getState().worktrees).length, 1);
  await f.host.observe(f.session, f.event('prompt-a'));
  assert.equal(f.getState().preferences.workspace.mode, 'new');
  assert.equal(f.getState().preferences.workspace.baseRef, 'refs/heads/main');
  const released = await f.rpc('settle', { sessionId: 'session', operationId: 'attempt-a' });
  assert.equal(released.ok, true);
  assert.equal(f.host.reservations.size, 0);
  const followup = await f.rpc('prepare', { sessionId: 'session', operationId: 'followup' }, f.peer);
  assert.equal(followup.ok, true);
  assert.equal(followup.value.actualDirectory, first.value.actualDirectory);
});

test('failed native send leaves no preference and retries reuse the prepared checkout', async t => {
  const f = await fixture(t);
  const first = await f.rpc('prepare', newRequest('first'));
  await f.rpc('settle', { sessionId: 'session', operationId: 'first' });
  assert.deepEqual(f.getState().preferences, {});
  const retry = await f.rpc('prepare', newRequest('retry'));
  assert.equal(retry.value.worktreeId, first.value.worktreeId);
  assert.equal(Object.keys(f.getState().worktrees).length, 1);
  await f.host.observe(f.session, f.event('context', 'working-directory'));
  assert.deepEqual(f.getState().preferences, {});
  await f.host.observe(f.session, f.event('human'));
  await f.rpc('settle', { sessionId: 'session', operationId: 'retry' });
  const duplicateCount = Object.keys(f.getState().accepted).length;
  await f.host.reconcile(f.session);
  assert.equal(Object.keys(f.getState().accepted).length, duplicateCount);
});

test('post-admission metadata failure reconciles before a later choice can change cwd', async t => {
  const f = await fixture(t);
  const first = await f.rpc('prepare', newRequest('first'));
  f.rejectNextAdmission();
  await assert.rejects(f.host.observe(f.session, f.event('persisted-human')), /metadata disk failure/);
  await f.rpc('settle', { sessionId: 'session', operationId: 'first' });
  assert.equal(f.getState().preferences.workspace.mode, 'new');
  const next = await f.rpc('prepare', { sessionId: 'session', operationId: 'next', choice: { mode: 'local' } });
  assert.equal(next.ok, true);
  assert.equal(next.value.actualDirectory, first.value.actualDirectory);
  assert.ok(f.warnings.some(value => value.includes('metadata disk failure')));
});

test('RPC enforces owner identity, exact inputs and revisioned absolute configuration', async t => {
  const f = await fixture(t);
  const stranger = { ...f.owner, principal: { kind: 'guest' } };
  assert.equal((await f.rpc('list', {}, stranger)).error.code, 'FORBIDDEN');
  assert.equal((await f.rpc('configure', { directory: '../outside', expectedRevision: 0 })).ok, false);
  assert.equal((await f.rpc('configure', { maxRetained: 0, expectedRevision: 0 })).ok, false);
  assert.equal((await f.rpc('list', { arbitrary: true })).ok, false);
  const configured = await f.rpc('configure', { maxRetained: 7, expectedRevision: 0 });
  assert.equal(configured.ok, true);
  assert.equal(configured.value.revision, 1);
  const listed = await f.rpc('list', {});
  assert.equal(listed.value.config.maxRetained, 7);
  assert.equal(listed.value.directoryPickerKind, 'native');
});

test('an existing unmanaged conversation keeps its directory and cannot be silently migrated', async t => {
  const f = await fixture(t);
  f.event('older-human');
  const ordinary = await f.rpc('prepare', { sessionId: 'session', operationId: 'followup' });
  assert.equal(ordinary.ok, true);
  assert.equal(ordinary.value.passthrough, true);
  assert.equal(f.getCwd(), f.source);
  assert.deepEqual(f.getState().worktrees, {});
  assert.equal(f.host.reservations.size, 0);
  const explicit = await f.rpc('prepare', newRequest('migrate'));
  assert.equal(explicit.ok, false);
  assert.match(explicit.error.message, /first message/);
  assert.equal(f.getCwd(), f.source);
});

test('management tool uses the same configuration and checkout operations and cannot self-approve', async t => {
  const f = await fixture(t);
  const definitions = new Map();
  const events = new Map();
  registerManagementTool({ tools: { register: definition => definitions.set(definition.name, definition) }, on: (name, handler) => events.set(name, handler) }, f.host);
  const definition = definitions.get('worktree_manage');
  const exec = { name: 'worktree_manage', callId: 'tool-call', rootCallId: 'tool-call', agent: f.agent, signal: new AbortController().signal, arguments: { action: 'configure', max_retained: 4 } };
  const gate = events.get('tools/pre-execute');
  assert.equal((await gate(exec, async () => ({ kind: 'allow' }))).kind, 'ask');
  const denied = { kind: 'deny', reason: 'Existing policy denied' };
  assert.equal(await gate(exec, async () => denied), denied);
  await assert.rejects(definition.execute({ action: 'configure', max_retained: 4, approved: true }, exec));
  await definition.execute(exec.arguments, exec);
  assert.equal((await f.rpc('list', {})).value.config.maxRetained, 4);
  const checkout = await definition.execute({ action: 'checkout', branch: 'other' }, exec);
  assert.equal(JSON.parse(checkout.text).currentBranch, 'other');
  assert.equal(await f.git('branch', '--show-current'), 'other');
  assert.equal((await f.rpc('workspace', { workspaceId: 'workspace' })).value.currentBranch, 'other');
});

function strictManagementArgs(action, overrides = {}) {
  return {
    action, session_id: '', workspace_id: '', worktree_id: '', mode: 'local',
    branch: '', directory: '', max_retained: 0, expected_revision: -1, ...overrides,
  };
}

function toolsFor(f) {
  const definitions = new Map();
  const events = new Map();
  const ctx = {
    tools: { register: value => definitions.set(value.name, value) },
    on: (name, listener) => events.set(name, listener),
  };
  registerInfoTool(ctx, f.host);
  registerManagementTool(ctx, f.host);
  return {
    info: definitions.get('worktree_info'), manage: definitions.get('worktree_manage'),
    gate: events.get('tools/pre-execute'),
    exec: args => ({ name: 'worktree_manage', callId: randomUUID(), agent: f.agent, signal: new AbortController().signal, arguments: args }),
  };
}

function eventsFor(f) {
  const events = new Map();
  registerHostEvents({ on: (name, listener, options) => events.set(name, { listener, options }) }, f.host);
  return events;
}

test('strict-filled info defaults to the calling workspace and exposes configuration with its revision', async (t) => {
  const f = await fixture(t);
  const tools = toolsFor(f);
  for (const action of ['status', 'list']) {
    const args = { action, workspace_id: '', offset: 0, limit: 20 };
    const result = JSON.parse((await tools.info.execute(args, tools.exec(args))).text);
    assert.equal(result.workspaceId, 'workspace');
    assert.deepEqual(result.config, { directory: f.pool, maxRetained: 15 });
    assert.equal(result.revision, 0);
    assert.deepEqual(result.records, []);
    assert.equal(result.total, 0);
  }
  const branches = { action: 'branches', workspace_id: '', offset: 0, limit: 20 };
  const branchResult = JSON.parse((await tools.info.execute(branches, tools.exec(branches))).text);
  assert.equal(branchResult.currentBranch, 'main');
  assert.ok(branchResult.branches.some(branch => branch.name === 'other'));
  f.ctx.workspaceRegistry.list = () => [];
  for (const action of ['status', 'list']) {
    const args = { action, workspace_id: '', offset: 0, limit: 20 };
    const result = JSON.parse((await tools.info.execute(args, tools.exec(args))).text);
    assert.equal(result.workspaceId, null);
    assert.deepEqual(result.config, { directory: f.pool, maxRetained: 15 });
    assert.equal(result.revision, 0);
  }
});

test('strict-filled prepare and checkout preserve settings and require native approval', async (t) => {
  const f = await fixture(t);
  const tools = toolsFor(f);
  const initialConfig = f.host.configuration();
  const checkoutArgs = strictManagementArgs('checkout', { mode: 'new', branch: 'other' });
  const checkoutExec = tools.exec(checkoutArgs);
  const approval = await tools.gate(checkoutExec, async () => ({ kind: 'allow' }));
  assert.equal(approval.kind, 'ask');
  assert.equal(approval.reason, 'Allow managed worktree operation: checkout');
  assert.equal(approval.displayReason.en, approval.reason);
  const denial = { kind: 'deny', reason: 'Existing native policy denied' };
  assert.equal(await tools.gate(checkoutExec, async () => denial), denial);
  const existingAsk = { kind: 'ask', code: 'EXISTING_APPROVAL', reason: 'Existing native approval' };
  assert.equal(await tools.gate(checkoutExec, async () => existingAsk), existingAsk);
  const checkout = JSON.parse((await tools.manage.execute(checkoutArgs, checkoutExec)).text);
  assert.equal(checkout.currentBranch, 'other');
  assert.equal(await f.git('branch', '--show-current'), 'other');
  assert.deepEqual(f.host.configuration(), initialConfig);
  assert.deepEqual(f.host.manager.list().bindings, {});
  assert.equal(f.host.descriptor().revision, 0);

  const prepareArgs = strictManagementArgs('prepare', { mode: 'new' });
  const prepareExec = tools.exec(prepareArgs);
  assert.equal((await tools.gate(prepareExec, async () => ({ kind: 'allow' }))).kind, 'ask');
  const prepared = JSON.parse((await tools.manage.execute(prepareArgs, prepareExec)).text);
  assert.equal(prepared.ready, true);
  assert.notEqual(prepared.actualDirectory, f.source);
  assert.equal((await fs.stat(prepared.actualDirectory)).isDirectory(), true);
  assert.equal(f.host.manager.list().bindings.session.mode, 'new');
  assert.deepEqual(f.host.configuration(), initialConfig);
  assert.equal(f.host.descriptor().revision, 0);
  assert.equal(f.host.reservations.size, 0, 'tool preparation settles its own native operation');
  await assert.rejects(tools.manage.execute({ ...prepareArgs, approved: true }, tools.exec(prepareArgs)));
  await assert.rejects(tools.manage.execute({ ...prepareArgs, mode: '' }, tools.exec(prepareArgs)));
  await assert.rejects(tools.manage.execute(strictManagementArgs('restore'), tools.exec(prepareArgs)), /requires worktree_id/);
  assert.deepEqual(f.host.configuration(), initialConfig);
});

test('strict configure fillers preserve unused fields and revision zero remains an explicit comparison', async (t) => {
  const f = await fixture(t);
  const tools = toolsFor(f);
  assert.equal(tools.manage.parameters.properties.max_retained.minimum, 0);
  assert.equal(tools.manage.parameters.properties.expected_revision.minimum, -1);
  const initial = strictManagementArgs('configure', { mode: 'new', max_retained: 4, expected_revision: 0 });
  assert.equal((await tools.gate(tools.exec(initial), async () => ({ kind: 'allow' }))).kind, 'ask');
  const configured = JSON.parse((await tools.manage.execute(initial, tools.exec(initial))).text);
  assert.deepEqual(configured.config, { directory: f.pool, maxRetained: 4 });
  assert.equal(configured.revision, 1);
  assert.deepEqual(f.host.manager.list().bindings, {});

  const directory = path.join(path.dirname(f.source), 'future-pool');
  const changeDirectory = strictManagementArgs('configure', { directory });
  const directoryResult = JSON.parse((await tools.manage.execute(changeDirectory, tools.exec(changeDirectory))).text);
  assert.deepEqual(directoryResult.config, { directory, maxRetained: 4 });
  assert.equal(directoryResult.revision, 2);
  const fillersOnly = strictManagementArgs('configure', { mode: 'new' });
  const unchanged = JSON.parse((await tools.manage.execute(fillersOnly, tools.exec(fillersOnly))).text);
  assert.deepEqual(unchanged.config, directoryResult.config);
  const currentRevision = f.host.descriptor().revision;

  const stale = strictManagementArgs('configure', { max_retained: 7, expected_revision: 0 });
  await assert.rejects(tools.manage.execute(stale, tools.exec(stale)));
  assert.deepEqual(f.host.configuration(), unchanged.config);
  assert.equal(f.host.descriptor().revision, currentRevision);
  for (const patch of [{ maxRetained: 0 }, { directory: '' }, { expectedRevision: -1 }]) {
    const result = await f.rpc('configure', { expectedRevision: currentRevision, ...patch });
    assert.equal(result.ok, false, 'tool sentinels must not weaken UI/RPC constraints');
  }
  await assert.rejects(tools.manage.execute({ ...fillersOnly, max_retained: -1 }, tools.exec(fillersOnly)));
  await assert.rejects(tools.manage.execute({ ...fillersOnly, expected_revision: -2 }, tools.exec(fillersOnly)));
  assert.deepEqual(f.host.configuration(), unchanged.config);
});

test('native workspace domain changes refresh discovery and request cleanup without reacting to other domains', async (t) => {
  const f = await fixture(t);
  const events = eventsFor(f);
  const changed = events.get('domain/changed').listener;
  const event = { table: '', key: '', operation: 'put', value: { pinnedSessionIds: ['session'] } };
  changed({ ...event, domain: 'dsh_worktrees' });
  changed({ ...event, domain: 'settings' });
  assert.equal(f.host.cleanupRequested, false);
  assert.equal(f.calls.filter(call => call[0] === 'session-list').length, 0);
  changed({ ...event, domain: 'workspace' });
  assert.equal(f.host.cleanupRequested, true);
  await f.host.discoveryPending;
  assert.equal(f.calls.filter(call => call[0] === 'session-list').length, 1);
  changed({ domain: 'workspace', table: 'workspaces', key: 'workspace', operation: 'deleted' });
  await f.host.discoveryPending;
  assert.equal(f.calls.filter(call => call[0] === 'session-list').length, 2, 'workspace changes invalidate the discovery cooldown');
  const sessionEvent = events.get('session/event').listener;
  sessionEvent(f.session, { type: 'working-directory/change', data: { cwd: f.source } });
  await f.host.discoveryPending;
  assert.equal(f.calls.filter(call => call[0] === 'session-list').length, 3);
  sessionEvent(f.session, { type: 'unrelated-event', data: {} });
  assert.equal(f.calls.filter(call => call[0] === 'session-list').length, 3);
});

test('native prompt and step guards recover a deleted managed subdirectory to the verified checkout root', async (t) => {
  const f = await fixture(t);
  const prepared = await f.rpc('prepare', newRequest('nested-cwd'));
  assert.equal(prepared.ok, true);
  const directory = prepared.value.actualDirectory;
  await f.host.observe(f.session, f.event('accepted-managed'));
  await f.rpc('settle', { sessionId: 'session', operationId: 'nested-cwd' });
  const events = eventsFor(f);
  const prompt = events.get('system-prompt/assemble');
  assert.equal(prompt.options.prepend, true);
  const guards = [
    next => prompt.listener({}, { agent: f.agent, signal: new AbortController().signal }, next),
    next => events.get('agent/pre-step').listener({ agent: f.agent, signal: new AbortController().signal }, next),
  ];
  for (const [index, guard] of guards.entries()) {
    const nested = path.resolve(directory, `nested-${index}`);
    assert.equal(path.dirname(nested), path.resolve(directory));
    await fs.mkdir(nested);
    await f.ctx.workingDirectory.set(f.agent, nested);
    const nativeResult = { prepared: index };
    assert.equal(await guard(async () => {
      assert.equal(f.getCwd(), nested, 'existing native navigation is preserved');
      return nativeResult;
    }), nativeResult);
    await fs.rmdir(nested);
    assert.equal(await guard(async () => {
      assert.equal(f.getCwd(), directory, 'recovery runs before native ensure can select the source workspace');
      return nativeResult;
    }), nativeResult);
    assert.notEqual(f.getCwd(), f.source);
  }
  const relative = path.relative(path.resolve(f.pool), path.resolve(directory));
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  await fs.rm(path.resolve(directory), { recursive: true, force: false });
  for (const guard of guards) {
    await assert.rejects(guard(() => assert.fail('native send must not run when the whole managed checkout is missing')), error => error.code === 'RESTORE_REQUIRED');
  }
  assert.equal(f.getCwd(), directory, 'a missing checkout must never fall back to the original source');
});

test('accepted Local followups preserve native navigation to a subdirectory or an existing worktree', async (t) => {
  const f = await fixture(t);
  const prepared = await f.rpc('prepare', { sessionId: 'session', operationId: 'local-first', choice: { mode: 'local' } });
  assert.equal(prepared.ok, true);
  await f.host.observe(f.session, f.event('accepted-local'));
  await f.rpc('settle', { sessionId: 'session', operationId: 'local-first' });
  const nested = path.join(f.source, 'nested');
  await fs.mkdir(nested);
  const existing = path.join(path.dirname(f.source), 'native-worktree');
  await f.git('worktree', 'add', '--detach', existing, 'HEAD');
  for (const [index, directory] of [nested, existing].entries()) {
    await f.ctx.workingDirectory.set(f.agent, directory);
    const nativeDirectory = f.getCwd();
    const operationId = `local-followup-${index}`;
    const next = await f.rpc('prepare', { sessionId: 'session', operationId });
    assert.equal(next.ok, true);
    assert.equal(next.value.actualDirectory, nativeDirectory);
    assert.equal(f.getCwd(), nativeDirectory);
    await f.host.assertAvailable(f.agent, new AbortController().signal);
    assert.equal(f.getCwd(), nativeDirectory);
    await f.rpc('settle', { sessionId: 'session', operationId });
  }
  assert.equal(f.host.manager.list().bindings.session.mode, 'local');
  assert.deepEqual(f.host.manager.list().worktrees, {});
});
