import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const session = Object.freeze({ sessionId: 'session-1' });
const success = Object.freeze({ kind: 'success' });
const ready = { ready: true, actualDirectory: 'R:/worktrees/session-1', worktreeId: 'tree-1' };
const missing = {
  requiresRestore: true, worktreeId: 'tree-1', path: 'R:/worktrees/session-1',
  snapshotRef: 'refs/dsh-worktrees/snapshots/tree-1',
};
const primitives = Object.fromEntries([
  'Button', 'Menu', 'Modal', 'IconBranchOutlineRegular', 'IconChevronDownOutlineRegular',
].map((name) => [name, Symbol(name)]));
const ok = (value) => ({ ok: true, value });
const plain = (value) => JSON.parse(JSON.stringify(value));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function eventually(check, message) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) return;
    await setImmediate();
  }
  assert.ok(check(), message);
}

function listValue(overrides = {}) {
  return {
    records: [], bindings: [], preferences: [],
    config: { directory: 'R:/worktrees', maxRetained: 15 },
    revision: 1, directoryPickerKind: null, ...overrides,
  };
}

function workspaceValue(overrides = {}) {
  return {
    workspaceId: 'workspace-1', isGit: true, repositoryRoot: 'R:/source',
    currentBranch: 'main', head: 'a'.repeat(40), defaultBase: 'refs/heads/main',
    branches: [
      { name: 'main', ref: 'refs/heads/main', remote: null },
      { name: 'feature', ref: 'refs/heads/feature', remote: null },
      { name: 'origin/main', ref: 'refs/remotes/origin/main', remote: 'origin' },
    ],
    choice: { mode: 'local' }, ...overrides,
  };
}

function managedList(status = 'ready') {
  return listValue({
    records: [{
      id: 'tree-1', sessionIds: [session.sessionId], status, path: missing.path,
      repositoryRoot: 'R:/source', baseRef: 'refs/heads/main', snapshotRef: missing.snapshotRef,
    }],
    bindings: [{ sessionId: session.sessionId, worktreeId: 'tree-1', mode: 'new', baseRef: 'refs/heads/main' }],
  });
}

// React is an explicit boundary. This renderer evaluates the real slot components
// and their hooks, then leaves native primitives as elements for behavioral checks.
// It does not implement DOM layout, focus, portals, or React's scheduling.
function createRenderer() {
  const frames = new Map();
  let current;
  let effects;
  const sameDeps = (left, right) => left && right && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
  const cell = (initial) => {
    const index = current.index++;
    if (!current.cells[index]) current.cells[index] = initial();
    return current.cells[index];
  };
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, props: { ...props, children: children.flat() } };
    },
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
    useState(initial) {
      const state = cell(() => ({ value: typeof initial === 'function' ? initial() : initial }));
      return [state.value, (next) => { state.value = typeof next === 'function' ? next(state.value) : next; }];
    },
    useRef(initial) { return cell(() => ({ current: initial })); },
    useMemo(compute, deps) {
      const memo = cell(() => ({}));
      if (!sameDeps(memo.deps, deps)) { memo.value = compute(); memo.deps = deps; }
      return memo.value;
    },
    useCallback(callback, deps) { return React.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const state = cell(() => ({}));
      if (sameDeps(state.deps, deps)) return;
      state.deps = deps;
      effects.push(() => { state.cleanup?.(); state.cleanup = effect(); });
    },
  };
  function visit(node, path) {
    if (Array.isArray(node)) return node.map((child, index) => visit(child, `${path}:${index}`));
    if (node === null || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      let frame = frames.get(path);
      if (!frame || frame.type !== node.type) {
        frame = { type: node.type, cells: [], index: 0 };
        frames.set(path, frame);
      }
      const parent = current;
      current = frame;
      frame.index = 0;
      const rendered = node.type(node.props);
      current = parent;
      return visit(rendered, `${path}:render`);
    }
    return { ...node, props: { ...node.props, children: visit(node.props.children, `${path}:children`) } };
  }
  return {
    React,
    render(node, key) {
      effects = [];
      const rendered = visit(node, key);
      for (const effect of effects) effect();
      return rendered;
    },
    dispose() {
      for (const frame of frames.values()) for (const state of frame.cells) state.cleanup?.();
      frames.clear();
    },
  };
}

function nodesOf(node, type) {
  if (Array.isArray(node)) return node.flatMap((child) => nodesOf(child, type));
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...['children', 'footer', 'anchor'].flatMap((key) => nodesOf(node.props[key], type)),
  ];
}

function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  return typeof node === 'object' ? textOf(node.props?.children) : String(node);
}

function harness(t, options = {}) {
  const events = [];
  const nativeCalls = [];
  const warnings = [];
  const slots = new Map();
  const disposers = [];
  const renderer = createRenderer();
  const catalog = new Map();
  const listeners = new Map();
  const intervals = new Map();
  const documentListeners = new Map();
  let intervalId = 0;
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, listener) => documentListeners.set(name, listener),
    removeEventListener: (name, listener) => { if (documentListeners.get(name) === listener) documentListeners.delete(name); },
  };
  const workspaceSnapshot = {
    items: options.workspaces ?? [{ workspaceId: 'workspace-1', sessionIds: [session.sessionId] }],
    pinnedSessionIds: [], archivedSessionIds: [],
  };
  const endpoints = {
    list: () => ok(options.list ?? listValue()),
    workspace: () => ok(options.workspace ?? workspaceValue()),
    prepare: () => ok(ready),
    restore: () => ok({ restored: true }),
    settle: () => ok(undefined),
    ...options.endpoints,
  };
  const rpc = {
    async call(channel, endpoint, payload, signal) {
      assert.equal(channel, '/api');
      assert.ok(endpoint.startsWith('dsh-worktrees/'));
      endpoint = endpoint.slice('dsh-worktrees/'.length);
      assert.equal(this, rpc);
      events.push({ type: 'rpc', endpoint, payload, signal });
      assert.equal(typeof endpoints[endpoint], 'function', `Unexpected RPC endpoint: ${endpoint}`);
      return endpoints[endpoint](payload, signal);
    },
  };
  const original = async function (...args) {
    nativeCalls.push({ receiver: this, args });
    events.push({ type: 'native:start' });
    try { return await (options.native ? options.native.apply(this, args) : success); }
    finally { events.push({ type: 'native:finish' }); }
  };
  const prototype = {};
  const target = Object.create(prototype);
  const owner = options.methodOwner === 'own' ? target : prototype;
  Object.defineProperty(owner, 'sendSession', {
    configurable: true, enumerable: false, writable: options.writable ?? true, value: original,
  });
  const originalDescriptor = Object.getOwnPropertyDescriptor(owner, 'sendSession');
  // Cordis returns a transient function proxy on each method read. Descriptors
  // still expose the underlying method and a call keeps the caller's receiver.
  const conversation = new Proxy(target, {
    get(object, key, receiver) {
      const value = Reflect.get(object, key, receiver);
      return typeof value === 'function'
        ? new Proxy(value, { apply: (method, thisArg, args) => Reflect.apply(method, thisArg, args) })
        : value;
    },
  });
  const services = {
    connection: { rpc }, conversation,
    workspaces: { list: { getSnapshot: () => workspaceSnapshot } },
    uiWorkspace: {},
  };
  const locale = {
    register(namespace, language, messages) {
      const key = `${namespace}:${language}`;
      catalog.set(key, messages);
      return () => catalog.delete(key);
    },
    bind(namespace) {
      return (key, values = {}) => {
        const message = catalog.get(`${namespace}:en`)?.[key] ?? key;
        return message.replace(/\{([^}]+)\}/g, (_, name) => values[name] ?? `{${name}}`);
      };
    },
  };
  const ctx = {
    locale,
    get(name) {
      assert.ok(Object.hasOwn(services, name), `Unexpected service: ${name}`);
      return services[name];
    },
    effect(register) {
      const dispose = register();
      if (typeof dispose === 'function') disposers.push(dispose);
    },
    on(name, listener) {
      listeners.set(name, listener);
      disposers.push(() => listeners.delete(name));
    },
    slots: {
      entries: () => [],
      subscribe: () => () => {},
      inject(_name, register) { ctx.effect(register); },
      register(registration, Component) {
        slots.set(registration.name, { registration, Component });
        return () => slots.delete(registration.name);
      },
    },
  };
  let module;
  runInNewContext(source, {
    window: {
      __ModuleLoader__: { load(value) { module = value; } },
      setInterval(callback, delay) { const id = ++intervalId; intervals.set(id, { callback, delay }); return id; },
      clearInterval: (id) => intervals.delete(id),
    },
    document,
    AbortController, DOMException, Error, crypto: { randomUUID },
    console: { warn: (...args) => warnings.push(args) },
  }, { filename: 'dsh-worktrees/client.js' });
  assert.equal(module.id, 'dsh-worktrees');
  const plugin = module.factory((name) => {
    if (name === 'react') return renderer.React;
    assert.equal(name, '@deepseek-ai/dsh-client-ui-primitives');
    return primitives;
  });
  plugin.apply(ctx);
  const controller = slots.get('conversation.hero.options').registration.inject().controller;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer.dispose();
    for (const cleanup of disposers.reverse()) cleanup();
  };
  t.after(dispose);
  function renderSlot(name, props = {}) {
    const { registration, Component } = slots.get(name);
    return renderer.render(renderer.React.createElement(Component, {
      ...registration.inject(), t: locale.bind('worktrees'), sessionId: session.sessionId,
      useWorkspaces: (select) => select(workspaceSnapshot),
      useSessionRetainInfo: (select) => select({ retainedBy: { mainView: 1 } }),
      useSessions: (select) => select({ byId: {
        [session.sessionId]: { id: session.sessionId, retainedBy: { mainView: 1 } },
      } }),
      useSessionStatus: (select) => select(new Map()),
      ...props,
    }), name);
  }
  return {
    conversation, controller, dispose, events, nativeCalls, original, originalDescriptor,
    owner, prototype, rpc, services, target, warnings, workspaceSnapshot, intervals, document, documentListeners,
    calls: (endpoint) => events.filter((event) => event.type === 'rpc' && event.endpoint === endpoint),
    send: (...args) => conversation.sendSession(...args),
    renderSlot,
    modal: () => nodesOf(renderSlot('shell.overlay'), primitives.Modal)[0],
  };
}

function assertPluginError(result) {
  assert.equal(result.kind, 'error');
  assert.deepEqual(Reflect.ownKeys(result), ['kind'], 'plugin failure must not supply composer error text');
}

function assertSettled(fixture, index = 0, prepareIndex = index) {
  const preparation = fixture.calls('prepare')[prepareIndex];
  const settlement = fixture.calls('settle')[index];
  assert.ok(settlement, 'each tracked preparation must settle');
  assert.deepEqual(plain(settlement.payload), {
    sessionId: preparation.payload.sessionId, operationId: preparation.payload.operationId,
  });
  assert.equal(settlement.signal, undefined, 'settlement must survive client lifetime cancellation');
}

test('prepares before native send and preserves the receiver and every argument', async (t) => {
  const preparation = deferred();
  const admission = deferred();
  const fixture = harness(t, {
    endpoints: { prepare: () => preparation.promise }, native: () => admission.promise,
  });
  const attachments = Object.freeze(['draft-image', 'draft-file']);
  const text = '  Preserve spaces\n/path $literal  ';
  const signal = new AbortController().signal;
  const receiver = { scope: 'caller-session-context' };
  const choice = { mode: 'new', baseRef: 'refs/remotes/origin/main' };
  fixture.controller.choose(session.sessionId, choice);
  assert.notEqual(fixture.conversation.sendSession, fixture.conversation.sendSession);
  const pending = fixture.conversation.sendSession.call(receiver, session, text, attachments, 'steer', signal);
  await eventually(() => fixture.calls('prepare').length === 1, 'prepare should start');
  assert.equal(fixture.nativeCalls.length, 0);
  assert.equal(fixture.calls('settle').length, 0);
  assert.deepEqual(plain(fixture.calls('prepare')[0].payload.choice), choice);
  preparation.resolve(ok(ready));
  await eventually(() => fixture.nativeCalls.length === 1, 'native send should follow preparation');
  const call = fixture.nativeCalls[0];
  assert.equal(call.receiver, receiver);
  assert.equal(call.args.length, 5);
  [session, text, attachments, 'steer', signal].forEach((argument, index) => assert.equal(call.args[index], argument));
  assert.equal(fixture.calls('settle').length, 0);
  admission.resolve(success);
  assert.equal(await pending, success);
  assertSettled(fixture);
  assert.ok(fixture.events.findIndex((event) => event.type === 'native:finish')
    < fixture.events.findIndex((event) => event.endpoint === 'settle'));
});

test('preparation failure returns no text and exposes the raw error in the global native Modal', async (t) => {
  const message = 'fatal: worktree creation failed\nPermission denied: R:/worktrees';
  const fixture = harness(t, {
    endpoints: { prepare: () => ({ ok: false, error: { code: 'GIT_FAILED', message, details: { exitCode: 128 } } }) },
  });
  const result = await fixture.send(session, 'keep this draft', ['draft-file'], 'queue');
  assertPluginError(result);
  assert.equal(fixture.nativeCalls.length, 0);
  assertSettled(fixture);
  const modal = fixture.modal();
  assert.equal(modal.props.open, true);
  assert.equal(modal.props.title, 'Worktree operation failed');
  assert.equal(textOf(nodesOf(modal, 'pre')[0]), message);
  const buttons = nodesOf(modal.props.footer, primitives.Button);
  assert.equal(buttons.length, 1);
  assert.equal(textOf(buttons[0]), 'Close');
  buttons[0].props.onClick();
  assert.equal(fixture.modal().props.open, false);
});

for (const [label, response, message] of [
  ['invalid RPC envelope', { value: ready }, 'The worktree service returned an invalid response.'],
  ['missing ready flag', ok({ actualDirectory: ready.actualDirectory }), 'The worktree is not ready. Refresh and try again.'],
  ['empty prepared directory', ok({ ready: true, actualDirectory: '' }), 'The worktree is not ready. Refresh and try again.'],
]) {
  test(`${label} blocks native send and settles the attempt`, async (t) => {
    const fixture = harness(t, { endpoints: { prepare: () => response } });
    assertPluginError(await fixture.send(session, 'draft', [], 'queue'));
    assert.equal(fixture.nativeCalls.length, 0);
    assertSettled(fixture);
    assert.equal(textOf(nodesOf(fixture.modal(), 'pre')[0]), message);
  });
}

test('canceling the restore Modal preserves the draft outcome and settles without native send', async (t) => {
  const fixture = harness(t, { list: managedList('removed'), endpoints: { prepare: () => ok(missing) } });
  const pending = fixture.send(session, 'draft with attachments', ['draft-image'], 'queue');
  await eventually(() => fixture.controller.dialog.getSnapshot()?.kind === 'restore', 'restore confirmation should open');
  const modal = fixture.modal();
  assert.equal(modal.props.open, true);
  assert.equal(modal.props.title, 'Restore worktree?');
  assert.ok(textOf(modal).includes(missing.path));
  const cancel = nodesOf(modal.props.footer, primitives.Button).find((button) => textOf(button) === 'Cancel');
  assert.ok(cancel);
  cancel.props.onClick();
  assertPluginError(await pending);
  assert.equal(fixture.calls('restore').length, 0);
  assert.equal(fixture.nativeCalls.length, 0);
  assertSettled(fixture);
  assert.equal(fixture.modal().props.open, false);
});

test('confirming restore performs restore, prepare, native send, then settlement', async (t) => {
  let preparations = 0;
  const restoration = deferred();
  const fixture = harness(t, {
    list: managedList('removed'),
    endpoints: {
      prepare: () => ok(++preparations === 1 ? missing : ready),
      restore: () => restoration.promise,
    },
  });
  const attachments = ['draft-image'];
  const pending = fixture.send(session, 'restore then send', attachments, 'steer');
  await eventually(() => fixture.controller.dialog.getSnapshot()?.kind === 'restore', 'restore confirmation should open');
  const restore = nodesOf(fixture.modal().props.footer, primitives.Button)
    .find((button) => textOf(button) === 'Restore');
  restore.props.onClick();
  await eventually(() => fixture.calls('restore').length === 1, 'restore RPC should start');
  assert.equal(fixture.calls('prepare').length, 1);
  assert.equal(fixture.nativeCalls.length, 0);
  assert.deepEqual(plain(fixture.calls('restore')[0].payload), { worktreeId: missing.worktreeId });
  restoration.resolve(ok({ restored: true }));
  assert.equal(await pending, success);
  assert.deepEqual(fixture.events.filter((event) => event.type.startsWith('native')
    || ['prepare', 'restore', 'settle'].includes(event.endpoint)).map((event) => event.endpoint ?? event.type),
  ['prepare', 'restore', 'prepare', 'native:start', 'native:finish', 'settle']);
  assert.deepEqual(plain(fixture.calls('prepare')[0].payload), plain(fixture.calls('prepare')[1].payload));
  assert.equal(fixture.nativeCalls[0].args[2], attachments);
  assertSettled(fixture);
  assert.equal(fixture.calls('settle').length, 1);
});

test('a restore failure stays in the global Modal and never calls native send', async (t) => {
  const fixture = harness(t, {
    endpoints: {
      prepare: () => ok(missing),
      restore: () => ({ ok: false, error: { code: 'RESTORE_FAILED', message: 'Saved snapshot is unavailable', details: null } }),
    },
  });
  const pending = fixture.send(session, 'draft', [], 'queue');
  await eventually(() => fixture.controller.dialog.getSnapshot()?.kind === 'restore', 'restore confirmation should open');
  nodesOf(fixture.modal().props.footer, primitives.Button).find((button) => textOf(button) === 'Restore').props.onClick();
  assertPluginError(await pending);
  assert.equal(fixture.calls('prepare').length, 1);
  assert.equal(fixture.nativeCalls.length, 0);
  assertSettled(fixture);
  assert.equal(textOf(nodesOf(fixture.modal(), 'pre')[0]), 'Saved snapshot is unavailable');
});

test('abort while restore confirmation is open cancels quietly and settles', async (t) => {
  const fixture = harness(t, { endpoints: { prepare: () => ok(missing) } });
  const abort = new AbortController();
  const pending = fixture.send(session, 'draft', ['draft-image'], 'queue', abort.signal);
  await eventually(() => fixture.controller.dialog.getSnapshot()?.kind === 'restore', 'restore confirmation should open');
  abort.abort();
  assertPluginError(await pending);
  assert.equal(fixture.controller.dialog.getSnapshot(), null);
  assert.equal(fixture.calls('restore').length, 0);
  assert.equal(fixture.nativeCalls.length, 0);
  assertSettled(fixture);
});

test('an already aborted send never prepares or calls native send', async (t) => {
  const fixture = harness(t);
  const abort = new AbortController();
  abort.abort();
  assertPluginError(await fixture.send(session, 'draft', [], 'queue', abort.signal));
  assert.equal(fixture.calls('prepare').length, 0);
  assert.equal(fixture.calls('settle').length, 0);
  assert.equal(fixture.nativeCalls.length, 0);
  assert.equal(fixture.controller.dialog.getSnapshot(), null);
});

test('native error outcomes retain their exact object and text without a plugin Modal', async (t) => {
  const outcome = Object.freeze({ kind: 'error', text: 'Native admission rejected this prompt' });
  const fixture = harness(t, { native: () => outcome });
  assert.equal(await fixture.send(session, 'draft', ['draft-file'], 'queue'), outcome);
  assertSettled(fixture);
  assert.equal(fixture.controller.dialog.getSnapshot(), null);
});

test('native promise rejection is rethrown unchanged after settlement', async (t) => {
  const error = new Error('Native attachment serialization failed');
  const fixture = harness(t, { native: () => { throw error; } });
  await assert.rejects(fixture.send(session, 'draft', ['draft-image'], 'queue'), (caught) => caught === error);
  assertSettled(fixture);
  assert.equal(fixture.controller.dialog.getSnapshot(), null);
});

test('settlement failure warns without changing an admitted native result', async (t) => {
  const fixture = harness(t, {
    endpoints: { settle: () => ({ ok: false, error: { code: 'OFFLINE', message: 'Connection lost', details: null } }) },
  });
  assert.equal(await fixture.send(session, 'draft', [], 'queue'), success);
  assert.equal(fixture.calls('settle').length, 1);
  assert.equal(fixture.warnings.length, 1);
  assert.equal(fixture.warnings[0][1].message, 'Connection lost');
  assert.equal(fixture.controller.dialog.getSnapshot(), null);
});

test('followups omit a draft choice even before bindings reach the list projection', async (t) => {
  const fixture = harness(t);
  fixture.controller.choose(session.sessionId, { mode: 'new', baseRef: 'refs/heads/feature' });
  assert.equal(await fixture.send(session, 'first', [], 'queue'), success);
  fixture.controller.choose(session.sessionId, { mode: 'local' });
  assert.equal(await fixture.send(session, 'followup', [], 'steer'), success);
  const calls = fixture.calls('prepare');
  assert.deepEqual(plain(calls[0].payload.choice), { mode: 'new', baseRef: 'refs/heads/feature' });
  assert.equal(Object.hasOwn(calls[1].payload, 'choice'), false);
  assert.notEqual(calls[0].payload.operationId, calls[1].payload.operationId);
  assertSettled(fixture, 0);
  assertSettled(fixture, 1);
});

test('an existing binding suppresses any newly selected draft choice', async (t) => {
  const fixture = harness(t, { list: managedList() });
  await fixture.controller.refresh();
  fixture.controller.choose(session.sessionId, { mode: 'local' });
  assert.equal(await fixture.send(session, 'followup', [], 'queue'), success);
  assert.equal(Object.hasOwn(fixture.calls('prepare')[0].payload, 'choice'), false);
  assertSettled(fixture);
});

test('an empty session menu shows the workspace saved mode and base before any send', async (t) => {
  const fixture = harness(t, { workspace: workspaceValue({ choice: { mode: 'new', baseRef: 'refs/heads/feature' } }) });
  fixture.renderSlot('conversation.hero.options');
  await eventually(() => fixture.calls('workspace').length > 0
    && fixture.controller.workspaceState('workspace-1').store.getSnapshot().phase === 'ready', 'workspace options should load');
  const menus = nodesOf(fixture.renderSlot('conversation.hero.options'), primitives.Menu);
  assert.equal(menus.length, 2);
  assert.equal(menus[0].props.selectedId, 'new');
  assert.equal(menus[1].props.selectedId, 'refs/heads/feature');
  assert.equal(fixture.calls('prepare').length, 0);
  assert.equal(fixture.nativeCalls.length, 0);
  menus[0].props.onSelect('local');
  const local = nodesOf(fixture.renderSlot('conversation.hero.options'), primitives.Menu);
  assert.equal(local[0].props.selectedId, 'local');
  assert.deepEqual(local[1].props.items.map((item) => item.id), ['refs/heads/main', 'refs/heads/feature']);
});

test('saved list preferences initialize an empty menu when workspace choice is absent', async (t) => {
  const fixture = harness(t, {
    workspace: workspaceValue({ choice: undefined }),
    list: listValue({ preferences: [{ workspaceId: 'workspace-1', mode: 'new', baseRef: 'refs/remotes/origin/main' }] }),
  });
  await fixture.controller.refresh();
  await fixture.controller.loadWorkspace('workspace-1');
  const menus = nodesOf(fixture.renderSlot('conversation.hero.options'), primitives.Menu);
  assert.equal(menus[0].props.selectedId, 'new');
  assert.equal(menus[1].props.selectedId, 'refs/remotes/origin/main');
});

test('a session without a workspace waits for initial bindings before deciding it is unmanaged', async (t) => {
  const listing = deferred();
  const fixture = harness(t, { workspaces: [], endpoints: { list: () => listing.promise } });
  const pending = fixture.send(session, 'managed outside the source workspace', [], 'queue');
  await eventually(() => fixture.calls('list').length === 1, 'initial binding list should start');
  assert.equal(fixture.nativeCalls.length, 0);
  assert.equal(fixture.calls('prepare').length, 0);
  listing.resolve(ok(managedList()));
  assert.equal(await pending, success);
  assert.equal(fixture.calls('prepare').length, 1);
  assert.equal(Object.hasOwn(fixture.calls('prepare')[0].payload, 'choice'), false);
  assertSettled(fixture);
});

test('an unmanaged session without a workspace passes through the exact native result and arguments', async (t) => {
  const outcome = Object.freeze({ kind: 'error', text: 'native-only failure' });
  const fixture = harness(t, { workspaces: [], native: () => outcome });
  const attachments = ['ordinary-draft'];
  const signal = new AbortController().signal;
  assert.equal(await fixture.send(session, 'ordinary', attachments, 'queue', signal), outcome);
  assert.equal(fixture.nativeCalls[0].receiver, fixture.conversation);
  assert.equal(fixture.nativeCalls[0].args[0], session);
  assert.equal(fixture.nativeCalls[0].args[1], 'ordinary');
  assert.equal(fixture.nativeCalls[0].args[2], attachments);
  assert.equal(fixture.nativeCalls[0].args[3], 'queue');
  assert.equal(fixture.nativeCalls[0].args[4], signal);
  assert.equal(fixture.calls('list').length, 1);
  assert.equal(fixture.calls('prepare').length, 0);
  assert.equal(fixture.calls('settle').length, 0);
  assert.equal(fixture.controller.dialog.getSnapshot(), null);
});

test('failed initial binding discovery cannot silently classify a session as unmanaged', async (t) => {
  const fixture = harness(t, {
    workspaces: [],
    endpoints: { list: () => ({ ok: false, error: { code: 'OFFLINE', message: 'Cannot load worktrees', details: null } }) },
  });
  assertPluginError(await fixture.send(session, 'draft', [], 'queue'));
  assert.equal(fixture.nativeCalls.length, 0);
  assert.equal(fixture.calls('prepare').length, 0);
  assert.equal(fixture.calls('settle').length, 0);
  assert.equal(textOf(nodesOf(fixture.modal(), 'pre')[0]), 'Cannot load worktrees');
});

for (const methodOwner of ['own', 'prototype']) {
  test(`disposal restores the original ${methodOwner} descriptor through transient method proxies`, async (t) => {
    const fixture = harness(t, { methodOwner, writable: false });
    const installed = Object.getOwnPropertyDescriptor(fixture.target, 'sendSession');
    assert.notEqual(installed.value, fixture.original);
    assert.equal(Object.getOwnPropertyDescriptor(fixture.owner, 'sendSession')?.enumerable, false);
    fixture.dispose();
    if (methodOwner === 'prototype') assert.equal(Object.hasOwn(fixture.target, 'sendSession'), false);
    assert.deepEqual(Object.getOwnPropertyDescriptor(fixture.owner, 'sendSession'), fixture.originalDescriptor);
    assert.equal(await fixture.send(session, 'after disposal', [], 'queue'), success);
    assert.equal(fixture.calls('prepare').length, 0);
    assert.equal(fixture.calls('settle').length, 0);
  });
}

test('disposal preserves a later wrapper and its captured gate delegates directly to native', async (t) => {
  const fixture = harness(t);
  const gate = fixture.conversation.sendSession;
  const laterCalls = [];
  function later(...args) { laterCalls.push(this); return gate.apply(this, args); }
  Object.defineProperty(fixture.conversation, 'sendSession', { configurable: true, writable: true, value: later });
  fixture.dispose();
  assert.equal(Object.getOwnPropertyDescriptor(fixture.target, 'sendSession').value, later);
  const attachments = ['draft-image'];
  const signal = new AbortController().signal;
  assert.equal(await fixture.send(session, 'after disposal', attachments, 'steer', signal), success);
  assert.equal(laterCalls[0], fixture.conversation);
  assert.equal(fixture.nativeCalls[0].receiver, fixture.conversation);
  assert.equal(fixture.nativeCalls[0].args[2], attachments);
  assert.equal(fixture.nativeCalls[0].args[4], signal);
  assert.equal(fixture.calls('prepare').length, 0);
  assert.equal(fixture.calls('settle').length, 0);
});

test('disposal during first native send waits for native completion and settles through the captured RPC', async (t) => {
  const admission = deferred();
  const fixture = harness(t, { native: () => admission.promise });
  const pending = fixture.send(session, 'first', ['draft-image'], 'queue');
  await eventually(() => fixture.nativeCalls.length === 1, 'native admission should start');
  fixture.dispose();
  fixture.services.connection = { rpc: { call() { assert.fail('disposed context connection must not be used for settlement'); } } };
  assert.equal(fixture.calls('settle').length, 0, 'disposal must not release a pending native admission');
  admission.resolve(success);
  assert.equal(await pending, success);
  assertSettled(fixture);
  assert.equal(fixture.calls('settle').length, 1);
  assert.equal(fixture.warnings.length, 0);
  assert.ok(fixture.events.findIndex((event) => event.type === 'native:finish')
    < fixture.events.findIndex((event) => event.endpoint === 'settle'));
});

test('disposal during preparation aborts the request and settles without admitting a message', async (t) => {
  const preparation = deferred();
  const fixture = harness(t, { endpoints: { prepare: () => preparation.promise } });
  const pending = fixture.send(session, 'first', [], 'queue');
  await eventually(() => fixture.calls('prepare').length === 1, 'preparation should start');
  fixture.dispose();
  assert.equal(fixture.calls('prepare')[0].signal.aborted, true);
  preparation.resolve(ok(ready));
  assertPluginError(await pending);
  assert.equal(fixture.nativeCalls.length, 0);
  assertSettled(fixture);
  assert.equal(fixture.controller.dialog.getSnapshot(), null);
});

test('disposal cancels a pending restore dialog and settles its preparation', async (t) => {
  const fixture = harness(t, { endpoints: { prepare: () => ok(missing) } });
  const pending = fixture.send(session, 'draft', [], 'queue');
  await eventually(() => fixture.controller.dialog.getSnapshot()?.kind === 'restore', 'restore confirmation should open');
  fixture.dispose();
  assertPluginError(await pending);
  assert.equal(fixture.nativeCalls.length, 0);
  assert.equal(fixture.calls('restore').length, 0);
  assert.equal(fixture.controller.dialog.getSnapshot(), null);
  assertSettled(fixture);
});

test('overlapping sends use separate operation IDs and settle only their own completed native calls', async (t) => {
  const first = deferred();
  const second = deferred();
  const fixture = harness(t, { native: (_session, text) => text === 'first' ? first.promise : second.promise });
  const pendingFirst = fixture.send(session, 'first', [], 'queue');
  const pendingSecond = fixture.send(session, 'second', [], 'steer');
  await eventually(() => fixture.nativeCalls.length === 2, 'both native admissions should start');
  const preparations = fixture.calls('prepare');
  assert.equal(preparations.length, 2);
  assert.equal(typeof preparations[0].payload.operationId, 'string');
  assert.ok(preparations[0].payload.operationId.length > 0);
  assert.notEqual(preparations[0].payload.operationId, preparations[1].payload.operationId);
  assert.equal(fixture.calls('settle').length, 0);
  second.resolve(success);
  assert.equal(await pendingSecond, success);
  assert.equal(fixture.calls('settle').length, 1);
  assertSettled(fixture, 0, 1);
  first.resolve(success);
  assert.equal(await pendingFirst, success);
  assert.equal(fixture.calls('settle').length, 2);
  assertSettled(fixture, 1, 0);
});

test('existing worktrees decorate the sidebar without creating bindings or managed inventory entries', async (t) => {
  const observed = { id: 'external:checkout', path: 'R:/external/checkout', currentBranch: 'feature/existing', baseRef: null, status: 'ready', external: true, sessionIds: [session.sessionId] };
  const fixture = harness(t, { list: listValue({ observed: [observed] }) });
  await fixture.controller.refresh(true);
  const state = fixture.controller.data.getSnapshot();
  assert.equal(state.records.length, 0);
  assert.equal(state.bindingBySession.size, 0);
  assert.equal(state.observedBySession.get(session.sessionId).path, observed.path);
  const marker = fixture.renderSlot('sidebar.workspaces.session.row.action');
  assert.match(marker.props['aria-label'], /feature\/existing/);
  assert.equal(textOf(marker), 'feature/existing');
  assert.equal(nodesOf(marker, primitives.IconBranchOutlineRegular).length, 1);
  const hover = fixture.renderSlot('sidebar.session.row.hover');
  assert.deepEqual(plain(hover.props.children.map(textOf)), [
    'Worktree path: R:/external/checkout',
    'Worktree branch: feature/existing',
  ]);
});

for (const [reason, isGit, message] of [
  ['not-git', false, 'This workspace is not a Git repository.'],
  ['git-unavailable', false, 'Git is unavailable. Local sessions can still use this workspace.'],
  ['unborn-head', true, 'Create a commit in this repository before creating a worktree.'],
]) {
  test(`${reason} disables Git selectors while preserving Local sends`, async (t) => {
    const fixture = harness(t, {
      workspace: workspaceValue({ isGit, reason, head: null, currentBranch: null, defaultBase: null, branches: [] }),
    });
    fixture.renderSlot('conversation.hero.options');
    await eventually(() => fixture.controller.workspaceState('workspace-1').store.getSnapshot().phase === 'ready', 'workspace should finish loading');
    const menus = nodesOf(fixture.renderSlot('conversation.hero.options'), primitives.Menu);
    assert.equal(menus.length, 2);
    for (const menu of menus) {
      assert.equal(menu.props.anchor.props.disabled, true);
      assert.ok(menu.props.anchor.props.title.includes(message));
      assert.equal(menu.props.open, false);
    }
    assert.equal(textOf(menus[0].props.anchor), 'Local');
    assert.equal(await fixture.send(session, 'local conversation', [], 'queue'), success);
    assert.equal(fixture.nativeCalls.length, 1);
    assert.equal(fixture.calls('prepare')[0].payload.choice, undefined);
  });
}

test('background status refresh pauses while hidden and removes browser listeners on disposal', async (t) => {
  const fixture = harness(t);
  fixture.renderSlot('shell.overlay');
  await eventually(() => fixture.controller.data.getSnapshot().phase === 'ready', 'initial list should be ready');
  const timer = [...fixture.intervals.values()][0];
  assert.equal(timer.delay, 5000);
  const before = fixture.calls('list').length;
  fixture.document.visibilityState = 'hidden';
  timer.callback();
  await setImmediate();
  assert.equal(fixture.calls('list').length, before);
  fixture.document.visibilityState = 'visible';
  timer.callback();
  await eventually(() => fixture.calls('list').length > before, 'visible polling should refresh status');
  assert.equal(fixture.calls('list').at(-1).payload.refresh, false);
  await eventually(() => fixture.controller.data.getSnapshot().phase === 'ready', 'poll should finish');
  fixture.documentListeners.get('visibilitychange')();
  await eventually(() => fixture.calls('list').at(-1).payload.refresh === true, 'returning to the page should refresh Git metadata');
  fixture.dispose();
  assert.equal(fixture.intervals.size, 0);
  assert.equal(fixture.documentListeners.size, 0);
});
