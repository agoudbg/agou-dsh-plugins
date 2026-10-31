import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./client.js', import.meta.url), 'utf8');
const node = (type, props, ...children) => ({ type, props: { ...props, children } });
const react = {
  createElement: node,
  Fragment: Symbol('Fragment'),
  Children: { toArray: (children) => [children].flat(Infinity).filter((child) => child != null) },
  isValidElement: (element) => element != null && typeof element === 'object' && 'type' in element,
  cloneElement: (element, props, ...children) => node(element.type, {
    ...element.props, ...props,
  }, ...(children.length === 0 ? element.props.children : children)),
};

// The ModuleLoader, Slot registry, and selector hooks are external boundaries.
// Record element output without a browser; the production component owns all status decisions.
function fixture({ rows = [{ id: 'a' }, { id: 'b' }], statuses = [], archived = [], locale = 'en' } = {}) {
  let plugin;
  let wrapper;
  let groupBy = 'workspace';
  const state = {
    list: {
      ids: rows.map((row) => row.id),
      byId: Object.fromEntries(rows.map((row) => [row.id, { blank: false, retainedBy: {}, ...row }])),
    },
    statuses: new Map(statuses),
    workspaces: { archivedSessionIds: archived },
  };
  const actions = { setGroupBy: (mode) => { groupBy = mode; } };
  const view = { actions, getSnapshot: () => ({ groupBy }) };
  const entry = {
    locale: 'workspace', options: { priority: 0 }, children: [], inject: {},
    store: { spec: { persist: 'dsh.workspace.view.v5' }, create: () => view },
    component: () => node('section', {}, node('header', {}, node('span', {}, 'Workspaces'))),
  };
  const dictionaries = {};
  runInNewContext(source, {
    console,
    window: {
      localStorage: { getItem: () => null, setItem() {} },
      __ModuleLoader__: {
        load({ factory }) {
          plugin = factory((name) => {
            assert.equal(name, 'react');
            return react;
          });
        },
      },
    },
  });
  plugin.apply({
    effect: (effect) => effect(),
    on: () => () => {},
    locale: {
      register: (_namespace, locale, dictionary) => { dictionaries[locale] = dictionary; },
      bind: () => (key) => dictionaries[locale][key],
    },
    slots: {
      inject: (_slot, effect) => effect(),
      entries: () => [entry],
      register: (_options, component) => { wrapper = component; return () => {}; },
    },
  });
  function render() {
    const elements = [];
    function visit(element) {
      if (!react.isValidElement(element)) return;
      if (typeof element.type === 'function') return visit(element.type(element.props));
      elements.push(element);
      for (const child of react.Children.toArray(element.props.children)) visit(child);
    }
    visit(wrapper({
      wide: true, actions,
      useStore: (select) => select(view.getSnapshot()),
      useSessions: (select) => select(state.list),
      useSessionStatus: (select) => select(state.statuses),
      useWorkspaces: (select) => select(state.workspaces),
    }));
    const button = elements.find((element) => element.type === 'button');
    assert.ok(button, 'The grouping button still renders');
    const badge = elements.find((element) => element.props.className?.includes('-badge '));
    return { button, badge };
  }
  return { state, render };
}

const unread = { completionUnread: true };
const pending = (kind) => ({ pendingInteraction: { kind } });
const cases = [
  ['no conversations', { rows: [] }, undefined],
  ['missing status baseline', {}, undefined],
  ['running alone', { statuses: [['a', { running: true }]] }, undefined],
  ['unread completion', { statuses: [['a', unread]] }, 'unread'],
  ['approval', { statuses: [['a', pending('approval')]] }, 'waiting'],
  ['plan review', { statuses: [['a', pending('plan-review')]] }, 'waiting'],
  ['question', { statuses: [['a', pending('question')]] }, 'waiting'],
  ['unknown interaction kind', { statuses: [['a', pending('other')]] }, undefined],
  ['unread after waiting', { statuses: [['a', pending('approval')], ['b', unread]] }, 'unread'],
  ['unread before waiting', { statuses: [['a', unread], ['b', pending('question')]] }, 'unread'],
  ['unread and waiting on one conversation', {
    statuses: [['a', { ...unread, ...pending('plan-review') }]],
  }, 'unread'],
  ['archived unread', { archived: ['a'], statuses: [['a', unread]] }, undefined],
  ['archived waiting', { archived: ['a'], statuses: [['a', pending('approval')]] }, undefined],
  ['archived unread does not hide an actionable conversation', {
    archived: ['a'], statuses: [['a', unread], ['b', pending('question')]],
  }, 'waiting'],
  ['subagent-only conversation', {
    rows: [{ id: 'a', origin: 'subagent' }], statuses: [['a', unread]],
  }, undefined],
  ['unlisted retained status', { statuses: [['outside-list', unread]] }, undefined],
  ['hidden blank conversation', {
    rows: [{ id: 'a', blank: true }], statuses: [['a', unread]],
  }, undefined],
  ['visible new conversation', {
    rows: [{ id: 'a', blank: true, retainedBy: { mainView: 1 } }],
    statuses: [['a', pending('question')]],
  }, 'waiting'],
  ['ordinary fork', {
    rows: [{ id: 'a', parentId: 'parent' }], statuses: [['a', unread]],
  }, 'unread'],
];

for (const [name, input, expected] of cases) {
  test(`bell attention: ${name}`, () => {
    const { button, badge } = fixture(input).render();
    assert.equal(button.props.title, 'Show all sessions in one list');
    if (expected === undefined) {
      assert.equal(badge, undefined);
      assert.equal(button.props['aria-label'], 'Show all sessions in one list');
    } else {
      assert.ok(badge.props.className.endsWith(`-badge-${expected}`));
      assert.equal(badge.props['aria-hidden'], true);
      assert.equal(badge.type, 'svg');
      assert.equal(badge.props.viewBox, '0 0 10 10');
      assert.equal(badge.props.children[0].type, 'circle');
      assert.equal(badge.props.children[0].props.r, 3);
      assert.ok(button.props['aria-label'].includes(expected === 'unread'
        ? 'Unread conversations' : 'Conversations awaiting action'));
    }
  });
}

test('status and archive changes update the indicator without changing grouping', () => {
  const { state, render } = fixture({ statuses: [['a', unread], ['b', pending('approval')]] });
  assert.ok(render().badge.props.className.endsWith('-unread'));
  state.statuses.set('a', { completionUnread: false });
  assert.ok(render().badge.props.className.endsWith('-waiting'));
  state.workspaces.archivedSessionIds = ['b'];
  assert.equal(render().badge, undefined);
  state.workspaces.archivedSessionIds = [];
  assert.ok(render().badge.props.className.endsWith('-waiting'));
  state.statuses.set('b', { completionUnread: false, pendingInteraction: undefined });
  assert.equal(render().badge, undefined);
  assert.equal(render().button.props['aria-pressed'], false);
});

test('view toggles preserve conversation reminders and keep status out of Chinese tooltips', () => {
  const { state, render } = fixture({
    locale: 'zh', statuses: [['a', unread], ['b', pending('question')]],
  });
  assert.equal(render().button.props.title, '切换到单列表');
  assert.equal(render().button.props['aria-label'], '切换到单列表 · 有未读对话');
  render().button.props.onClick();
  assert.equal(render().button.props['aria-pressed'], true);
  assert.ok(render().badge.props.className.endsWith('-unread'));
  assert.equal(render().button.props.title, '切换到按工作区分组');
  assert.equal(render().button.props['aria-label'], '切换到按工作区分组 · 有未读对话');
  state.statuses.set('a', { completionUnread: false });
  assert.ok(render().badge.props.className.endsWith('-waiting'));
  assert.equal(render().button.props['aria-pressed'], true);
  assert.equal(render().button.props.title, '切换到按工作区分组');
  assert.equal(render().button.props['aria-label'], '切换到按工作区分组 · 有等待操作的对话');
  render().button.props.onClick();
  assert.equal(render().button.props['aria-pressed'], false);
  assert.ok(render().badge.props.className.endsWith('-waiting'));
  assert.equal(render().button.props.title, '切换到单列表');
});
