window.__ModuleLoader__.load({
  id: 'dsh-session-workspace-label',
  factory(require) {
    const React = require('react');
    const { IconFolderCloseRegular } = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement;
    const NS = 'session-workspace-label';
    const LABEL = 'dsh-session-workspace-label';
    const SLOT = 'sidebar.workspaces.session.row.action';
    const ROW = `[class*="_flatList"] [data-row-key^="session:"]:has(.${LABEL})`;

    // The row action seat is always mounted, including on active and archived
    // rows. Keep its label visible at rest while the original buttons keep
    // their hover behavior. Remove idle buttons from layout: invisible buttons
    // in a zero-width strip still contribute overflow to ancestor scrollports.
    // Scope layout changes to rows containing our label.
    // DSH 0.2.2-rc.1 wraps the quick actions in span.rowQuickActions between
    // rowActions and the row.action slot anchor, so the resting rules must
    // reach through that wrapper while still matching the pre-rc.1 layout.
    // rc.1 also hides every non-pinned occupant under that wrapper with an
    // unconditional rule (specificity 0,4,0), so the resting display rule for
    // the label must carry a higher specificity to win the cascade.
    const RESTING = `${ROW}:not(:hover):not([class*="_menuOpen"]) > [class*="_rowActions"]`;
    const CSS = `
.${LABEL} { display: none; }
${ROW} {
  position: relative;
  box-sizing: border-box;
  height: 48px;
  padding-top: 4px;
  padding-bottom: 24px;
}
${ROW} > [class*="_rowActions"] {
  display: inline-flex;
}
${RESTING} > :not([class*="_rowQuickActions"]):not([data-slot="${SLOT}"]),
${RESTING} > [data-slot="${SLOT}"] > :not(.${LABEL}),
${RESTING} > [class*="_rowQuickActions"] [data-slot="${SLOT}"] > :not(.${LABEL}) {
  display: none;
}
${ROW} .${LABEL},
${RESTING} > [class*="_rowQuickActions"] [data-slot="${SLOT}"] > .${LABEL} {
  position: absolute;
  inset-inline: 28px 8px;
  bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 17px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  font-weight: 400;
  line-height: 17px;
  white-space: nowrap;
  pointer-events: none;
}
.${LABEL}-icon { flex: none; }
.${LABEL}-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;

    // Workspace snapshots are immutable. Share one membership index across
    // every row, rebuilding only when the workspace items change.
    const indexes = new WeakMap();
    function workspaceOf(items, sessionId) {
      let index = indexes.get(items);
      if (index === undefined) {
        index = new Map();
        for (const workspace of items) {
          for (const id of workspace.sessionIds) {
            if (!index.has(id)) index.set(id, workspace);
          }
        }
        indexes.set(items, index);
      }
      return index.get(sessionId);
    }

    function WorkspaceLabel({ sessionId, useWorkspaces, t }) {
      const workspace = useWorkspaces((snapshot) => workspaceOf(snapshot.items, sessionId));
      const label = workspace === undefined
        ? t('ungrouped')
        : workspace.title === 'default-workspace' ? t('defaultWorkspace') : workspace.title;
      return h('span', { className: LABEL },
        h(IconFolderCloseRegular, { size: 14, className: `${LABEL}-icon`, 'aria-hidden': true }),
        h('span', { className: `${LABEL}-text` }, label));
    }

    function WorkspaceLabelStyle() {
      return h('style', {
        'data-plugin': 'dsh-session-workspace-label',
        'data-plugin-css': 'dsh-session-workspace-label/sidebar.css',
      }, CSS);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', {
          ungrouped: 'Ungrouped',
          defaultWorkspace: 'Default workspace',
        }));
        ctx.effect(() => ctx.locale.register(NS, 'zh', {
          ungrouped: '未分组',
          defaultWorkspace: '默认工作区',
        }));
        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: 'session-workspace-label',
          order: 1000,
          locale: NS,
        }, WorkspaceLabel));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-workspace-label-style',
          order: 1000,
        }, WorkspaceLabelStyle));
      },
    };
  },
});
