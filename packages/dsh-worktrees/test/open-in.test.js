import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const runtimeDirectory = process.env.DSH_TEST_RUNTIME;
const runtimeOptions = {
  skip: runtimeDirectory ? false : 'Set DSH_TEST_RUNTIME to the installed @deepseek-ai scope directory to exercise the native Open in App module.',
};
const nativeSource = runtimeDirectory
  ? readFileSync(path.join(runtimeDirectory, 'dsh-client-ui-open-in-app', 'lib', 'client.js'), 'utf8') : undefined;
const worktreeSource = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const HEADER = 'conversation.session.header.utilities';
const SOURCE = 'R:/source';
const FIRST = 'session-1';
const SECOND = 'session-2';
const primitives = Object.fromEntries([
  'Button', 'Menu', 'Modal', 'Toast', 'Tooltip', 'IconBranchOutlineRegular', 'IconFollowsystemOutlineRegular',
  'IconChevronDownOutlineRegular', 'IconWarningOutlineRegular',
  'IconRightUpOutlineRegular', 'IconFolderOpenOutlineRegular',
].map(name => [name, Symbol(name)]));

// External rendering boundary: execute the real components/hooks and retain the
// native primitive callbacks. This does not model DOM, portals, focus, or React scheduling.
function createRenderer() {
  const frames = new Map();
  let current;
  let effects;
  const cell = initial => {
    const index = current.index++;
    if (!current.cells[index]) current.cells[index] = initial();
    return current.cells[index];
  };
  const sameDeps = (left, right) => left && right && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, key: props?.key, props: { ...props, ...(children.length ? { children: children.flat() } : {}) } };
    },
    useState(initial) {
      const state = cell(() => ({ value: typeof initial === 'function' ? initial() : initial }));
      return [state.value, next => { state.value = typeof next === 'function' ? next(state.value) : next; }];
    },
    useRef(initial) { return cell(() => ({ current: initial })); },
    useMemo(compute, deps) {
      const memo = cell(() => ({}));
      if (!sameDeps(memo.deps, deps)) { memo.value = compute(); memo.deps = deps; }
      return memo.value;
    },
    useCallback(callback, deps) { return React.useMemo(() => callback, deps); },
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
    useEffect(effect, deps) {
      const state = cell(() => ({}));
      if (sameDeps(state.deps, deps)) return;
      state.deps = deps;
      effects.push(() => { state.cleanup?.(); state.cleanup = effect(); });
    },
  };
  function visit(node, position) {
    if (Array.isArray(node)) return node.map((child, index) => visit(child, `${position}:${index}`));
    if (!node || typeof node !== 'object' || !node.props) return node;
    const location = `${position}:${node.key ?? ''}`;
    if (typeof node.type === 'function') {
      let frame = frames.get(location);
      if (!frame || frame.type !== node.type) {
        frame = { type: node.type, cells: [], index: 0 };
        frames.set(location, frame);
      }
      const parent = current;
      current = frame;
      frame.index = 0;
      let rendered;
      try { rendered = node.type(node.props); }
      finally { current = parent; }
      return visit(rendered, `${location}:render`);
    }
    const props = { ...node.props };
    for (const key of ['children', 'anchor', 'footer']) {
      if (Object.hasOwn(props, key)) props[key] = visit(props[key], `${location}:${key}`);
    }
    return { ...node, props };
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
  if (Array.isArray(node)) return node.flatMap(child => nodesOf(child, type));
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...['children', 'anchor', 'footer'].flatMap(key => nodesOf(node.props[key], type)),
  ];
}

function snapshotStore(initial) {
  let snapshot = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set(value) { snapshot = value; for (const listener of listeners) listener(); },
  };
}

// Public slots registration/notification is an explicit external boundary. Raw
// entries include every owner, including shadowed entries. This deliberately does
// not recreate SlotCore winner selection; tests inspect registrations themselves.
function slotBoundary() {
  const rows = [];
  const listeners = new Map();
  const notify = name => { for (const listener of [...(listeners.get(name) ?? [])]) listener(); };
  return {
    entries: name => rows.filter(row => row.options.name === name),
    listenerCount: name => listeners.get(name)?.size ?? 0,
    subscribe(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
      return () => listeners.get(name).delete(listener);
    },
    register(options, component) {
      const entry = { options: { ...options }, locale: options.locale, inject: options.inject, registrant: options.registrant, component };
      rows.push(entry);
      notify(options.name);
      return () => {
        const index = rows.indexOf(entry);
        if (index < 0) return;
        rows.splice(index, 1);
        notify(options.name);
      };
    },
  };
}

async function harness(t, options = {}) {
  const renderer = createRenderer();
  const slots = slotBoundary();
  const catalog = new Map();
  const warnings = [];
  const requests = [];
  const projectionReads = [];
  const selectors = [];
  const owners = [];
  const projections = new Map([[FIRST, 'R:/worktrees/one'], [SECOND, 'R:/worktrees/two']]);
  const sessions = Object.freeze({
    revision: 7,
    byId: Object.freeze(Object.fromEntries([FIRST, SECOND].map(sessionId => [sessionId, Object.freeze({
      sessionId, cwd: SOURCE, title: sessionId, retainedBy: Object.freeze({ mainView: 1 }),
    })]))),
  });
  const locale = {
    register(namespace, language, messages) {
      const dictionaries = typeof language === 'string' ? { [language]: messages } : language;
      for (const [key, value] of Object.entries(dictionaries)) catalog.set(`${namespace}:${key}`, value);
      return () => {
        for (const [key, value] of Object.entries(dictionaries)) {
          if (catalog.get(`${namespace}:${key}`) === value) catalog.delete(`${namespace}:${key}`);
        }
      };
    },
    bind(namespace) {
      return (key, values = {}) => (catalog.get(`${namespace}:en`)?.[key] ?? key)
        .replace(/\{([^}]+)\}/g, (_, name) => values[name] ?? `{${name}}`);
    },
  };
  const shortcuts = { catalog: snapshotStore([]), register: () => () => {} };
  const services = {
    conversation: { async sendSession() { return { kind: 'success' }; } },
    connection: { rpc: { call() { assert.fail('Header rendering must not call the worktree RPC.'); } } },
    workspaces: { list: snapshotStore({ items: [] }) }, uiWorkspace: {},
  };
  const fetcher = async (route, init) => {
    requests.push({ route, ...init, ...(init?.body ? { payload: JSON.parse(init.body) } : {}) });
    if (route === 'open-in-app/apps') return { ok: true, json: async () => ({ apps: ['vscode', 'terminal', 'unknown-app'] }) };
    assert.equal(route, 'open-in-app/open');
    return options.launch ? options.launch(JSON.parse(init.body), init) : { ok: true };
  };
  function mount(source, probe) {
    const cleanups = [];
    const own = cleanup => {
      let active = true;
      const dispose = () => { if (active) { active = false; cleanup?.(); } };
      cleanups.push(dispose);
      return dispose;
    };
    const ctx = {
      locale, shortcuts, remote: {}, sessions: { list: snapshotStore(sessions) },
      layout: { panelInfo: snapshotStore({ activePanelId: null }) },
      get(name) { assert.ok(Object.hasOwn(services, name), `Unexpected service: ${name}`); return services[name]; },
      effect(register) { return own(register()); },
      on() { return own(() => {}); },
      slots: {
        entries: slots.entries, subscribe: slots.subscribe,
        inject(_name, register) { return own(register()); },
        register(registration, component) {
          if (probe && registration.name === HEADER) {
            const Native = component;
            component = props => { probe(props); return renderer.React.createElement(Native, props); };
          }
          return own(slots.register({ ...registration, registrant: source === worktreeSource ? 'worktrees' : 'native' }, component));
        },
      },
    };
    let module;
    runInNewContext(source, {
      window: { __ModuleLoader__: { load(value) { module = value; } } },
      AbortController, DOMException, Error, crypto: { randomUUID }, fetch: fetcher,
      console: { warn: (...args) => warnings.push(args) },
    });
    const dependencies = {
      react: renderer.React,
      'react/jsx-runtime': {
        Fragment: renderer.React.Fragment,
        jsx: (type, props, key) => renderer.React.createElement(type, { ...props, key }),
        jsxs: (type, props, key) => renderer.React.createElement(type, { ...props, key }),
      },
      '@deepseek-ai/dsh-client-store': { createSnapshotStore: snapshotStore },
      '@deepseek-ai/dsh-client-ui-primitives': primitives,
    };
    const plugin = module.factory(name => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected native dependency: ${name}`);
      return dependencies[name];
    });
    plugin.apply(ctx);
    const owner = { dispose() { for (const cleanup of cleanups.toReversed()) cleanup(); } };
    owners.push(owner);
    return owner;
  }
  const mountNative = probe => {
    const before = new Set(slots.entries(HEADER));
    const owner = mount(nativeSource, probe);
    owner.entry = slots.entries(HEADER).find(entry => !before.has(entry) && entry.registrant === 'native');
    assert.ok(owner.entry, 'The actual native module must register its header action.');
    return owner;
  };
  const mountWorktrees = () => mount(worktreeSource);
  const native = options.native === false ? undefined : mountNative(options.probe);
  const worktrees = options.worktrees === false ? undefined : mountWorktrees();
  t.after(() => {
    for (const owner of owners.toReversed()) owner.dispose();
    renderer.dispose();
  });
  await setImmediate();
  const adapter = () => {
    const entries = slots.entries(HEADER).filter(entry => entry.options.id === 'open-in-app' && entry.registrant === 'worktrees');
    assert.equal(entries.length, 1, 'One worktree header adapter must be registered.');
    return entries[0];
  };
  function render(sessionId = FIRST, entry = adapter(), overrides = {}) {
    const injected = entry.inject?.() ?? {};
    const hooks = Object.fromEntries(Object.entries(injected.hooks ?? {}).map(([name, store]) => [
      `use${name[0].toUpperCase()}${name.slice(1)}`, select => select(store.getSnapshot()),
    ]));
    return renderer.render(renderer.React.createElement(entry.component, {
      ...injected, ...hooks, sessionId, t: locale.bind(entry.locale),
      useProjection(key) { projectionReads.push({ sessionId, key }); return projections.get(sessionId); },
      useSessions(select, equals) { selectors.push({ sessionId, equals }); return select(sessions); },
      ...overrides,
    }), sessionId);
  }
  return {
    native, worktrees, mountNative, mountWorktrees, slots, projections, sessions,
    warnings, requests, projectionReads, selectors, adapter, render,
    launches: () => requests.filter(request => request.route === 'open-in-app/open'),
    primary: tree => nodesOf(tree, 'button').find(node => !node.props['aria-haspopup']),
    menu: tree => nodesOf(tree, primitives.Menu)[0],
  };
}

async function clickAndFlush(callback) {
  callback();
  await setImmediate();
}

test('native header default and menu launches follow each session projection and preserve shared rows', runtimeOptions, async t => {
  const h = await harness(t);
  const entry = h.adapter();
  assert.equal(entry.locale, h.native.entry.locale);
  assert.equal(entry.inject, h.native.entry.inject);
  assert.equal(entry.options.order, h.native.entry.options.order);
  assert.ok(entry.options.priority < (h.native.entry.options.priority ?? 0), 'The adapter must outrank the native cell under lower-first Slot ordering.');
  const first = h.render(FIRST);
  assert.equal(h.primary(first).props['aria-label'], 'Open in VS Code');
  assert.deepEqual(Array.from(h.menu(first).props.items, item => item.id), ['app:vscode', 'app:terminal']);
  await clickAndFlush(h.primary(first).props.onClick);
  await clickAndFlush(() => h.menu(h.render(SECOND)).props.onSelect('app:terminal'));
  await clickAndFlush(h.primary(h.render(FIRST)).props.onClick);
  assert.deepEqual(h.launches().map(request => request.payload), [
    { app: 'vscode', path: 'R:/worktrees/one' },
    { app: 'terminal', path: 'R:/worktrees/two' },
    { app: 'terminal', path: 'R:/worktrees/one' },
  ]);
  for (const request of h.launches()) {
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['content-type'], 'application/json');
  }
  assert.equal(h.requests.filter(request => request.route === 'open-in-app/apps').length, 1);
  assert.equal(h.sessions.byId[FIRST].cwd, SOURCE);
  assert.equal(h.sessions.byId[SECOND].cwd, SOURCE);
  assert.ok(h.projectionReads.every(read => read.key === 'workingDirectory'));
});

test('current nested and Local directories replace the prior header target on rerender', runtimeOptions, async t => {
  const h = await harness(t);
  for (const directory of ['R:/worktrees/one', 'R:/worktrees/one/src/nested', SOURCE, 'R:/source/docs']) {
    h.projections.set(FIRST, directory);
    await clickAndFlush(h.primary(h.render()).props.onClick);
    assert.equal(h.launches().at(-1).payload.path, directory);
  }
  assert.equal(h.sessions.byId[FIRST].cwd, SOURCE);
});

for (const [name, projection] of [['undefined', undefined], ['null', null], ['empty', ''], ['non-string', false]]) {
  test(`native header hides for ${name} projection without falling back to the source`, runtimeOptions, async t => {
    const h = await harness(t);
    assert.ok(h.primary(h.render()), 'A ready projection initially exposes the native action.');
    h.projections.set(FIRST, projection);
    assert.equal(h.render(), null);
    assert.equal(h.launches().length, 0);
    assert.equal(h.sessions.byId[FIRST].cwd, SOURCE);
    h.projections.set(FIRST, 'R:/worktrees/recovered');
    await clickAndFlush(h.primary(h.render()).props.onClick);
    assert.equal(h.launches()[0].payload.path, 'R:/worktrees/recovered');
  });
}

test('the selector-local view preserves other sessions, row fields, and selector equality argument', runtimeOptions, async t => {
  const equals = (left, right) => left === right;
  const selected = [];
  const h = await harness(t, { probe: props => selected.push(props.useSessions(state => state, equals)) });
  h.render(FIRST);
  assert.notEqual(selected[0], h.sessions);
  assert.equal(selected[0].byId[FIRST].cwd, 'R:/worktrees/one');
  assert.equal(selected[0].byId[FIRST].title, h.sessions.byId[FIRST].title);
  assert.equal(selected[0].byId[FIRST].retainedBy, h.sessions.byId[FIRST].retainedBy);
  assert.equal(selected[0].byId[SECOND], h.sessions.byId[SECOND]);
  assert.equal(selected[0].revision, h.sessions.revision);
  assert.equal(h.selectors[0].equals, equals);
  h.projections.set(FIRST, SOURCE);
  h.render(FIRST);
  assert.equal(selected.at(-1), h.sessions, 'An already matching row must retain the original snapshot identity.');
  assert.equal(h.render('unknown-session'), null);
});

test('native launch errors keep the native toast and app choice, then permit a retry', runtimeOptions, async t => {
  let reject = true;
  const h = await harness(t, { launch: () => reject ? { ok: false, status: 503 } : { ok: true } });
  await clickAndFlush(() => h.menu(h.render()).props.onSelect('app:terminal'));
  const failed = h.render();
  assert.equal(nodesOf(failed, primitives.Toast)[0].props.text, 'Could not open. Try again.');
  assert.equal(h.primary(failed).props['aria-label'], 'Open in VS Code');
  assert.equal(h.primary(failed).props.disabled, false);
  reject = false;
  await clickAndFlush(h.primary(failed).props.onClick);
  assert.deepEqual(h.launches().map(request => request.payload), [
    { app: 'terminal', path: 'R:/worktrees/one' },
    { app: 'vscode', path: 'R:/worktrees/one' },
  ]);
});

test('the native controller serializes launches across session headers', runtimeOptions, async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = await harness(t, { launch: () => pending });
  const first = h.primary(h.render(FIRST));
  first.props.onClick();
  first.props.onClick();
  assert.equal(h.primary(h.render(SECOND)).props.disabled, true);
  assert.equal(h.launches().length, 1);
  release({ ok: true });
  await setImmediate();
  assert.equal(h.primary(h.render(SECOND)).props.disabled, false);
});

test('the adapter waits for the native cell and follows native unload and hot reload', runtimeOptions, async t => {
  const h = await harness(t, { native: false });
  assert.equal(h.slots.entries(HEADER).length, 0);
  const first = h.mountNative();
  await setImmediate();
  const adapted = h.adapter();
  await clickAndFlush(h.primary(h.render()).props.onClick);
  assert.equal(h.launches().at(-1).payload.path, 'R:/worktrees/one');
  first.dispose();
  assert.equal(h.slots.entries(HEADER).length, 0);
  const next = h.mountNative();
  await setImmediate();
  assert.notEqual(h.adapter().component, adapted.component);
  assert.equal(h.adapter().inject, next.entry.inject);
  await clickAndFlush(h.primary(h.render()).props.onClick);
  assert.equal(h.launches().at(-1).payload.path, 'R:/worktrees/one');
});

test('plugin disposal restores the original native registration and remount installs one adapter', runtimeOptions, async t => {
  const h = await harness(t);
  const native = h.native.entry;
  h.worktrees.dispose();
  assert.deepEqual(h.slots.entries(HEADER), [native]);
  assert.equal(h.slots.listenerCount(HEADER), 0);
  await clickAndFlush(h.primary(h.render(FIRST, native)).props.onClick);
  assert.equal(h.launches().at(-1).payload.path, SOURCE);
  const remounted = h.mountWorktrees();
  assert.equal(h.slots.entries(HEADER).length, 2);
  await clickAndFlush(h.primary(h.render()).props.onClick);
  assert.equal(h.launches().at(-1).payload.path, 'R:/worktrees/one');
  remounted.dispose();
  assert.deepEqual(h.slots.entries(HEADER), [native]);
});

for (const priority of [-1, 0, 2]) {
  test(`a competing same-cell registration with priority ${priority} suspends adaptation`, runtimeOptions, async t => {
    const h = await harness(t);
    const Native = h.native.entry;
    const removeCompetitor = h.slots.register({
      name: HEADER, id: 'open-in-app', priority, locale: 'other-owner',
    }, () => null);
    t.after(removeCompetitor);
    const rows = h.slots.entries(HEADER);
    assert.equal(rows.length, 2);
    assert.ok(rows.includes(Native));
    assert.equal(rows.some(row => row.registrant === 'worktrees'), false);
    assert.equal(h.warnings.length, 1);
    removeCompetitor();
    assert.equal(h.adapter().inject, Native.inject);
    await clickAndFlush(h.primary(h.render()).props.onClick);
    assert.equal(h.launches().at(-1).payload.path, 'R:/worktrees/one');
  });
}

test('an existing competing same-cell entry is respected while unrelated header entries coexist', runtimeOptions, async t => {
  const h = await harness(t, { worktrees: false });
  const unrelated = h.slots.register({ name: HEADER, id: 'another-action', priority: 10 }, () => null);
  const competitor = h.slots.register({ name: HEADER, id: 'open-in-app', priority: -1, locale: 'open-in-app' }, () => null);
  t.after(unrelated);
  t.after(competitor);
  h.mountWorktrees();
  assert.equal(h.slots.entries(HEADER).filter(row => row.options.id === 'open-in-app').length, 2);
  assert.equal(h.slots.entries(HEADER).some(row => row.registrant === 'worktrees'), false);
  competitor();
  assert.ok(h.adapter());
  assert.equal(h.slots.entries(HEADER).filter(row => row.options.id === 'another-action').length, 1);
});
