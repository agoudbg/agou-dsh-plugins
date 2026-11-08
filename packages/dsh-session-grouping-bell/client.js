window.__ModuleLoader__.load({
  id: 'dsh-session-grouping-bell',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'session-grouping-bell';
    const SLOT = 'sidebar.workspaces';
    const FOOTER_SLOT = 'sidebar.footer.action';
    const PREFIX = 'dsh-session-grouping-bell';
    const STORAGE_KEY = `${PREFIX}:last-grouped:v1`;
    const isGrouped = (mode) => mode === 'workspace' || mode === 'workspace-tree';
    const CSS = `
/* The shipped browser owns the header. Grow its heading to place the bell
   next to Search; leave its search-collapse transition in control. */
span:has(> .${PREFIX}-heading):not([class*="sectionLabelHidden"]) {
  flex: 1;
  max-width: none;
}
.${PREFIX}-heading {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.${PREFIX}-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${PREFIX}-button {
  display: inline-flex;
  position: relative;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  cursor: pointer;
}
.${PREFIX}-button:hover,
.${PREFIX}-button[aria-pressed="true"] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.${PREFIX}-button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.${PREFIX}-badge {
  position: absolute;
  top: 4px;
  right: 6px;
  display: block;
  width: 10px;
  height: 10px;
  pointer-events: none;
}
.${PREFIX}-badge-unread {
  color: var(--dsw-alias-state-success-primary);
}
.${PREFIX}-badge-waiting {
  color: var(--dsw-alias-state-warn-primary);
}
`;

    // Lucide Bell (ISC); attribution is included in LICENSE.
    // Match the sidebar's 16px icons with a 1px stroke after viewBox scaling.
    const bell = h('svg', {
      width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
      strokeLinejoin: 'round', 'aria-hidden': true, focusable: false,
    },
    h('path', { d: 'M10.268 21a2 2 0 0 0 3.464 0' }),
    h('path', { d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326' }));

    // Reuse the Search control's Tooltip component through the browser's
    // rendered elements; do not import private Harness client modules.
    function findHeaderTooltip(element) {
      if (!React.isValidElement(element)) return undefined;
      const children = React.Children.toArray(element.props.children);
      if (typeof element.type !== 'string'
        && typeof element.props.label === 'string'
        && element.props.side === 'bottom'
        && typeof element.props.delayMs === 'number'
        && children.length === 1 && children[0]?.type === 'button') return element;
      for (const child of children) {
        const tooltip = findHeaderTooltip(child);
        if (tooltip !== undefined) return tooltip;
      }
      return undefined;
    }

    function readLastGrouped() {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved === null) return undefined;
        if (isGrouped(saved)) return saved;
        console.warn(`[${PREFIX}] Invalid saved grouping; using the current grouped view:`, saved);
      } catch (error) {
        console.warn(`[${PREFIX}] Could not read saved grouping; using the current grouped view:`, error);
      }
      return undefined;
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', {
          showFlat: 'Show all sessions in one list',
          showWorkspace: 'Group sessions by workspace',
          showWorkspaceTree: 'Group sessions by workspace tree',
          unread: 'Unread conversations',
          waiting: 'Conversations awaiting action',
        }));
        ctx.effect(() => ctx.locale.register(NS, 'zh', {
          showFlat: '切换到单列表',
          showWorkspace: '切换到按工作区分组',
          showWorkspaceTree: '切换到按工作区树分组',
          unread: '有未读对话',
          waiting: '有等待操作的对话',
        }));
        const translate = ctx.locale.bind(NS);
        const wrappers = new WeakSet();
        const subscribeNone = () => () => {};
        const viewRef = { current: undefined };
        let lastGrouped = readLastGrouped();

        function remember(mode) {
          if (!isGrouped(mode) || mode === lastGrouped) return;
          lastGrouped = mode;
          try {
            window.localStorage.setItem(STORAGE_KEY, mode);
          } catch (error) {
            console.warn(`[${PREFIX}] Could not save grouping; keeping it for this page:`, error);
          }
        }

        // One toggle for both seats; it always reads the browser's live view
        // store handle so a re-registered browser cannot leave a stale closure.
        function toggle() {
          const view = viewRef.current;
          if (view === undefined) return;
          const mode = view.getSnapshot().groupBy;
          remember(mode);
          view.actions.setGroupBy(mode === 'flat' ? lastGrouped ?? 'workspace' : 'flat');
        }

        function BellButton({ flat, hint, tooltip, onClick, useSessions, useSessionStatus, useWorkspaces }) {
          const list = useSessions((state) => state);
          const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);
          const attention = useSessionStatus((statuses) => {
            const archived = new Set(archivedSessionIds);
            let waiting = false;
            for (const id of list.ids) {
              const session = list.byId[id];
              if (session === undefined || session.origin === 'subagent' || archived.has(id)
                || (session.blank && (session.retainedBy.mainView ?? 0) === 0)) continue;
              const status = statuses.get(id);
              if (status?.completionUnread === true) return 'unread';
              const kind = status?.pendingInteraction?.kind;
              if (kind === 'approval' || kind === 'plan-review' || kind === 'question') waiting = true;
            }
            return waiting ? 'waiting' : undefined;
          });
          const label = attention === undefined ? hint : `${hint} · ${translate(attention)}`;
          const button = h('button', {
            type: 'button', className: `${PREFIX}-button`,
            'aria-label': label, 'aria-pressed': flat, onClick,
            title: tooltip === undefined ? hint : undefined,
          }, bell, attention === undefined ? null : h('svg', {
            className: `${PREFIX}-badge ${PREFIX}-badge-${attention}`,
            width: 10, height: 10, viewBox: '0 0 10 10',
            'aria-hidden': true, focusable: false,
          }, h('circle', { cx: 5, cy: 5, r: 3, fill: 'currentColor' })));
          if (tooltip === undefined) return button;
          return h(tooltip.type, {
            label: hint,
            side: tooltip.props.side,
            delayMs: tooltip.props.delayMs,
            disabled: tooltip.props.disabled,
          }, button);
        }

        // Fallback seat for DSH builds that forbid re-declaring the browser's
        // child slots: the footer receives the framework's standard Hooks, and
        // the grouping state rides the browser's own view store handle.
        function FooterBell(props) {
          const view = viewRef.current;
          const flat = React.useSyncExternalStore(
            view === undefined ? subscribeNone : view.subscribe,
            () => view !== undefined && view.getSnapshot().groupBy === 'flat');
          if (view === undefined) return null;
          const hint = translate(!flat ? 'showFlat'
            : lastGrouped === 'workspace-tree' ? 'showWorkspaceTree' : 'showWorkspace');
          return h(BellButton, {
            flat, hint, onClick: toggle,
            useSessions: props.useSessions,
            useSessionStatus: props.useSessionStatus,
            useWorkspaces: props.useWorkspaces,
          });
        }

        ctx.slots.inject(SLOT, () => {
          let source;
          let disposeEntry;
          let disposeFooter;
          let syncing = false;
          let warned = false;
          let headerUnsupported = false;

          function dispose() {
            disposeEntry?.();
            disposeEntry = undefined;
            source = undefined;
          }

          function installFooter() {
            if (disposeFooter !== undefined) return;
            disposeFooter = ctx.slots.register({
              name: FOOTER_SLOT,
              id: 'session-grouping-bell',
              order: 100,
              locale: NS,
            }, FooterBell);
          }

          function sync() {
            if (syncing) return;
            // entries() includes shadowed registrations. Keep the original
            // browser, its injected operations, child slots and store identity.
            const entry = ctx.slots.entries(SLOT).find((candidate) =>
              candidate.locale === 'workspace'
              && !wrappers.has(candidate.component)
              && candidate.store?.spec?.persist === 'dsh.workspace.view.v5'
              && typeof candidate.component === 'function');
            if (entry === source) return;
            syncing = true;
            try {
              dispose();
              if (entry === undefined) {
                if (!warned) {
                  console.warn(`[${PREFIX}] Waiting for a compatible workspace browser.`);
                  warned = true;
                }
                return;
              }
              const view = entry.store.create();
              if (typeof view.actions.setGroupBy !== 'function') {
                throw new Error('The workspace browser has no setGroupBy action.');
              }
              source = entry;
              viewRef.current = view;
              if (lastGrouped === undefined) remember(view.getSnapshot().groupBy);

              // Preferred seat: wrap the browser and decorate its heading.
              // DSH builds whose slots forbid re-declaring an entry's children
              // reject the wrapper registration; fall back to the footer seat
              // instead of crashing the contribution.
              let decorate = !headerUnsupported;
              if (decorate) {
                const Browser = entry.component;

                function BrowserWithBell(props) {
                  const flat = props.useStore((state) => state.groupBy === 'flat');
                  // rc.5 exposes the entire browser as one slot. Delegate its
                  // render unconditionally so its Hooks stay on the same fiber,
                  // then decorate only its heading element. Translations remain
                  // strings, including the tree's accessible name.
                  const tree = Browser({
                    ...props,
                    actions: {
                      ...props.actions,
                      setGroupBy(mode) {
                        remember(mode);
                        props.actions.setGroupBy(mode);
                      },
                    },
                  });
                  if (!props.wide) return tree;
                  const children = React.Children.toArray(tree.props.children);
                  const header = children[0];
                  const headerChildren = React.Children.toArray(header.props.children);
                  const heading = headerChildren[0];
                  if (!React.isValidElement(heading) || heading.type !== 'span') {
                    throw new Error('Unsupported workspace browser header.');
                  }
                  const tooltip = findHeaderTooltip(headerChildren[1]);
                  if (tooltip === undefined) {
                    throw new Error('Unsupported workspace browser tooltip.');
                  }
                  const hint = translate(!flat ? 'showFlat'
                    : lastGrouped === 'workspace-tree' ? 'showWorkspaceTree' : 'showWorkspace');
                  headerChildren[0] = React.cloneElement(heading, {},
                    h('span', { className: `${PREFIX}-heading` },
                      h('span', { className: `${PREFIX}-label` }, heading.props.children),
                      h(BellButton, {
                        flat, hint, tooltip, onClick: toggle,
                        useSessions: props.useSessions,
                        useSessionStatus: props.useSessionStatus,
                        useWorkspaces: props.useWorkspaces,
                      })));
                  children[0] = React.cloneElement(header, {}, headerChildren);
                  return h(React.Fragment, null,
                    h('style', { 'data-plugin': PREFIX }, CSS),
                    React.cloneElement(tree, {}, children));
                }

                wrappers.add(BrowserWithBell);
                try {
                  disposeEntry = ctx.slots.register({
                    name: SLOT,
                    priority: (entry.options.priority ?? 0) - 1,
                    children: entry.children,
                    store: entry.store,
                    inject: entry.inject,
                    locale: entry.locale,
                  }, BrowserWithBell);
                } catch (error) {
                  disposeEntry = undefined;
                  source = undefined;
                  decorate = false;
                  headerUnsupported = true;
                  console.warn(`[${PREFIX}] The workspace header cannot be decorated on this DSH; placing the bell in the sidebar footer:`, error);
                }
              }
              if (!decorate) installFooter();
            } catch (error) {
              dispose();
              console.warn(`[${PREFIX}] Could not attach the grouping bell; retrying on the next slot change:`, error);
            } finally {
              syncing = false;
            }
          }

          const unsubscribe = ctx.on('slots/changed', (key) => {
            if (key === SLOT) sync();
          });
          sync();
          return () => {
            unsubscribe();
            dispose();
            disposeFooter?.();
          };
        });
      },
    };
  },
});
