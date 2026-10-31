import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const key = (provider, model) => `dsh-model-effort-memory:${JSON.stringify([provider, model])}`;
const groups = [
  { id: 'one', models: [
    { id: 'alpha', reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } },
    { id: 'beta', reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } },
  ] },
  { id: 'two', models: [
    { id: 'alpha', reasoning: { defaultEffort: 'low', efforts: [{ id: 'low' }, { id: 'high' }] } },
  ] },
];
const copy = (value) => JSON.parse(JSON.stringify(value));

function setup(storage = new Map(), unavailable = false) {
  const warnings = [];
  const localStorage = {
    getItem(name) {
      if (unavailable) throw new Error('Storage denied');
      return storage.get(name) ?? null;
    },
    setItem(name, value) {
      if (unavailable) throw new Error('Storage denied');
      storage.set(name, value);
    },
  };
  class ModelDirectory {
    constructor(current, catalog = groups) {
      this.snapshot = { current, groups: catalog };
      this.calls = [];
      this.failNext = false;
      this.deferProjection = false;
      this.queuedProjections = [];
      this.store = { getSnapshot: () => this.snapshot };
    }

    flushProjection() {
      for (const selection of this.queuedProjections) this.snapshot.current = selection;
      this.queuedProjections.length = 0;
    }

    async select(selection) {
      this.calls.push(copy(selection));
      if (this.failNext) {
        this.failNext = false;
        return { ok: false, error: { code: 'rejected' } };
      }
      if (this.deferProjection) this.queuedProjections.push(selection);
      else this.snapshot.current = selection;
      return { ok: true, value: undefined };
    }
  }
  const original = ModelDirectory.prototype.select;
  let module;
  runInNewContext(source, {
    window: { localStorage, __ModuleLoader__: { load(registered) { module = registered; } } },
    console: { warn: (...args) => warnings.push(args) },
  });
  assert.equal(module.id, 'dsh-model-effort-memory');
  const plugin = module.factory((id) => {
    assert.equal(id, '@deepseek-ai/dsh-client-ui-model-selection');
    return { ModelDirectory };
  });
  let cleanup;
  plugin.apply({ effect(register) { cleanup = register(); } });
  return { ModelDirectory, original, storage, warnings, cleanup, plugin };
}

test('restores the last effort for each provider/model with one selection call', async () => {
  const { ModelDirectory, storage, cleanup } = setup();
  const session = new ModelDirectory({ provider: 'one', model: 'alpha' });
  await session.select({ provider: 'one', model: 'alpha', reasoningEffort: 'high' });
  await session.select({ provider: 'one', model: 'beta' });
  await session.select({ provider: 'one', model: 'beta', reasoningEffort: 'low' });
  await session.select({ provider: 'one', model: 'alpha' });
  await session.select({ provider: 'one', model: 'beta' });
  assert.deepEqual(session.calls.map((call) => call.reasoningEffort), ['high', undefined, 'low', 'high', 'low']);
  assert.equal(session.calls.length, 5);
  assert.equal(JSON.parse(storage.get(key('one', 'alpha'))).effort, 'high');
  assert.equal(JSON.parse(storage.get(key('one', 'beta'))).effort, 'low');
  cleanup();
});

test('keeps a deliberate Default and separates providers with the same model ID', async () => {
  const { ModelDirectory, storage, cleanup } = setup();
  const session = new ModelDirectory({ provider: 'one', model: 'alpha', reasoningEffort: 'high' });
  await session.select({ provider: 'one', model: 'alpha' });
  await session.select({ provider: 'two', model: 'alpha', reasoningEffort: 'low' });
  await session.select({ provider: 'two', model: 'alpha', reasoningEffort: 'high' });
  await session.select({ provider: 'one', model: 'alpha' });
  assert.equal(session.calls.at(-1).reasoningEffort, undefined);
  assert.equal(JSON.parse(storage.get(key('one', 'alpha'))).effort, null);
  assert.equal(JSON.parse(storage.get(key('two', 'alpha'))).effort, 'high');
  cleanup();
});

test('captures an existing session effort after switching away', async () => {
  const { ModelDirectory, cleanup } = setup();
  const session = new ModelDirectory({ provider: 'one', model: 'alpha', reasoningEffort: 'high' });
  await session.select({ provider: 'one', model: 'beta' });
  await session.select({ provider: 'one', model: 'alpha' });
  assert.equal(session.calls.at(-1).reasoningEffort, 'high');
  cleanup();
});

test('failed selections do not replace saved efforts', async () => {
  const { ModelDirectory, storage, cleanup } = setup();
  const session = new ModelDirectory({ provider: 'one', model: 'alpha' });
  await session.select({ provider: 'one', model: 'alpha', reasoningEffort: 'low' });
  session.failNext = true;
  assert.equal((await session.select({ provider: 'one', model: 'alpha', reasoningEffort: 'high' })).ok, false);
  assert.equal(JSON.parse(storage.get(key('one', 'alpha'))).effort, 'low');
  await session.select({ provider: 'one', model: 'beta' });
  await session.select({ provider: 'one', model: 'alpha' });
  assert.equal(session.calls.at(-1).reasoningEffort, 'low');
  cleanup();
});

test('ignores invalid storage and efforts removed from the current catalog', async () => {
  const storage = new Map([
    [key('one', 'alpha'), '{bad json'],
    [key('one', 'beta'), JSON.stringify({ effort: 'ultra' })],
  ]);
  const { ModelDirectory, warnings, cleanup } = setup(storage);
  const session = new ModelDirectory({ provider: 'two', model: 'alpha' });
  await session.select({ provider: 'one', model: 'alpha' });
  await session.select({ provider: 'one', model: 'beta' });
  assert.equal(session.calls[0].reasoningEffort, undefined);
  assert.equal(session.calls[1].reasoningEffort, undefined);
  assert.ok(warnings.length > 0);
  cleanup();
});

test('keeps explicit choices while the session projection catches up', async () => {
  const { ModelDirectory, cleanup } = setup();
  const session = new ModelDirectory({ provider: 'one', model: 'alpha' });
  session.deferProjection = true;
  await session.select({ provider: 'one', model: 'alpha', reasoningEffort: 'high' });
  await session.select({ provider: 'one', model: 'alpha', reasoningEffort: 'low' });
  session.flushProjection();
  await session.select({ provider: 'one', model: 'beta' });
  session.flushProjection();
  await session.select({ provider: 'one', model: 'alpha' });
  assert.equal(session.calls.at(-1).reasoningEffort, 'low');
  cleanup();
});

test('falls back to the model default when a saved effort disappears', async () => {
  const { ModelDirectory, cleanup } = setup();
  const session = new ModelDirectory({ provider: 'one', model: 'alpha' });
  await session.select({ provider: 'one', model: 'alpha', reasoningEffort: 'high' });
  session.snapshot.groups = [
    { id: 'one', models: [
      { id: 'alpha', reasoning: { defaultEffort: 'low', efforts: [{ id: 'low' }] } },
      { id: 'beta', reasoning: { efforts: [{ id: 'low' }] } },
    ] },
  ];
  await session.select({ provider: 'one', model: 'beta' });
  await session.select({ provider: 'one', model: 'alpha', reasoningEffort: 'low' });
  assert.equal(session.calls.at(-1).reasoningEffort, 'low');
  cleanup();
});

test('persists across plugin reload and works in memory without localStorage', async () => {
  const storage = new Map();
  const first = setup(storage);
  const session = new first.ModelDirectory({ provider: 'one', model: 'alpha' });
  await session.select({ provider: 'one', model: 'alpha', reasoningEffort: 'high' });
  first.cleanup();
  assert.equal(first.ModelDirectory.prototype.select, first.original);

  const reloaded = setup(storage);
  const otherSession = new reloaded.ModelDirectory({ provider: 'one', model: 'beta' });
  await otherSession.select({ provider: 'one', model: 'alpha' });
  assert.equal(otherSession.calls[0].reasoningEffort, 'high');
  reloaded.cleanup();

  const blocked = setup(new Map(), true);
  const blockedSession = new blocked.ModelDirectory({ provider: 'one', model: 'alpha' });
  await blockedSession.select({ provider: 'one', model: 'alpha', reasoningEffort: 'high' });
  const anotherSession = new blocked.ModelDirectory({ provider: 'one', model: 'beta' });
  await anotherSession.select({ provider: 'one', model: 'alpha' });
  assert.equal(anotherSession.calls[0].reasoningEffort, 'high');
  assert.ok(blocked.warnings.length > 0);
  blocked.cleanup();
});
