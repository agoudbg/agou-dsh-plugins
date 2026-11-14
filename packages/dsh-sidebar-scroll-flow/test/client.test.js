import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function load(boot, require) {
  let module;
  runInNewContext(source, {
    window: { __DSH_BOOT__: boot, __ModuleLoader__: { load(value) { module = value; } } },
  });
  assert.equal(module.id, 'dsh-sidebar-scroll-flow');
  return module.factory(require);
}

for (const version of [
  '0.2.2-rc.3',
  '0.2.2-rc.3+build.1',
  '0.2.2-rc.3.1',
  '0.2.2-rc.4',
  '0.2.2-rc.10',
  '0.2.2-rc.beta',
  '0.2.2-zeta.1',
  '0.2.2',
  '0.2.2+build.1',
  '0.2.3-alpha.1',
  '0.2.10',
  '0.3.0-alpha.1',
  '1.0.0',
  'v1.0.0',
]) {
  test(`does nothing on DSH ${version}`, () => {
    const plugin = load({ release: { version } }, () => assert.fail('must not import modules'));
    assert.equal(plugin.inject, undefined);
    plugin.apply(new Proxy({}, { get() { assert.fail('must not access services'); } }));
  });
}

for (const boot of [
  undefined,
  {},
  { release: { version: '0.2.1-rc.5' } },
  { release: { version: '0.2.1' } },
  { release: { version: '0.2.1+build.1' } },
  { release: { version: '0.2.2-alpha.1' } },
  { release: { version: '0.2.2-beta.10' } },
  { release: { version: '0.2.2-1.999' } },
  { release: { version: '0.2.2-rc' } },
  { release: { version: '0.2.2-rc.0' } },
  { release: { version: '0.2.2-rc.1' } },
  { release: { version: '0.2.2-rc.2' } },
  { release: { version: '0.2.2-rc.2+build.999' } },
  { release: { version: '0.2.2-rc.2.999' } },
]) {
  const version = boot?.release?.version ?? 'without release metadata';
  test(`keeps the stylesheet on DSH ${version}`, () => {
    const plugin = load(boot, (id) => {
      assert.equal(id, 'react');
      return { createElement: (type, props, children) => ({ type, props, children }) };
    });
    const entries = [];
    plugin.apply({ slots: {
      inject(name, callback) {
        assert.equal(name, 'shell.overlay');
        callback();
      },
      register(options, Component) { entries.push({ options, style: Component() }); },
    } });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].options.id, 'sidebar-scroll-flow');
    assert.equal(entries[0].style.type, 'style');
    assert.equal(entries[0].style.props['data-plugin'], 'dsh-sidebar-scroll-flow');
    assert.match(entries[0].style.children, /overflow-y: auto !important/);
  });
}

test('rejects malformed release metadata before importing modules or injecting styles', () => {
  for (const version of ['', 'latest', 123, null]) {
    assert.throws(
      () => load({ release: { version } }, () => assert.fail('must not import modules')),
      /dsh-sidebar-scroll-flow: invalid DSH release version/,
    );
  }
});
