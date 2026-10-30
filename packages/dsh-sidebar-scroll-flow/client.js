window.__ModuleLoader__.load({
  id: 'dsh-sidebar-scroll-flow',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /**
     * Sidebar scroll restructure.
     *
     * Shipped layout (ui-sidebar SidebarRoot): the column is a fixed-height flex
     * column; the global panel rows (`nav` with `panelList` — Temporary tasks,
     * Plugins, Automated tasks, More) sit above the browsing region and never
     * move, while only the session list (WorkspaceBrowser `list`) scrolls.
     *
     * This sheet moves the scroll boundary to the column itself, so the panel
     * rows scroll away together with the session list. The brand row, the
     * New Session button and the foot (settings) stay where they are today via
     * `position: sticky`, so nothing the user relies on disappears.
     *
     * Selectors anchor on the readable suffix of the shipped CSS-module class
     * tokens (`hHd-Xa_panelList`, `bhn1Oq_list`, ...) instead of full hashed
     * names, so a rebuild that changes the hashes keeps working.
     */
    const CSS = [
      /* The whole sidebar column becomes the single scroll container, so the
         panel rows scroll away together with the session list. Scoped to the
         wide column: the collapsed rail keeps its own padding and never
         scrolls. */
      'div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) { overflow-y: auto !important; padding-top: 0 !important; padding-bottom: 0 !important; }',

      /* Brand row pinned at the top, widened to the full column; the 4px
         shadow band covers the seam down to the New Session button. */
      'div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="logoRow"] {',
      '  position: sticky !important;',
      '  top: 0 !important;',
      '  z-index: 3;',
      '  margin-left: -12px !important;',
      '  margin-right: -12px !important;',
      '  height: 66px !important;',
      '  padding-top: 14px !important;',
      '  padding-left: 16px !important;',
      '  padding-right: 12px !important;',
      '  background: var(--dsw-specific-sidebar-fill);',
      '  box-shadow: 0 4px 0 0 var(--dsw-specific-sidebar-fill);',
      '  /* the seam backdrop below is a pseudo of this row */',
      '  overflow: visible !important;',
      '}',
      /* Opaque backdrop behind the pinned New Session button: it stacks under
         the button but over the session rows, so rows scrolling underneath
         stay hidden, and its hairline is the line rows disappear at. */
      /* The hairline shows only while scrolled: a scroll-driven animation
         fades it in over the first pixels of scrolling. */
      '@keyframes sidebar-scroll-flow-line {',
      '  0% { border-bottom-color: transparent; }',
      '  8% { border-bottom-color: var(--dsw-alias-border-l3); }',
      '  100% { border-bottom-color: var(--dsw-alias-border-l3); }',
      '}',
      'div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="logoRow"]::after {',
      "  content: '';",
      '  position: absolute;',
      '  top: 70px;',
      '  left: 0;',
      '  right: 0;',
      '  box-sizing: border-box;',
      '  height: 50px;',
      '  background: var(--dsw-specific-sidebar-fill);',
      '  border-bottom: .5px solid var(--dsw-alias-border-l3);',
      '  animation: sidebar-scroll-flow-line linear both;',
      '  animation-timeline: scroll(nearest block);',
      '  animation-range: 0 12px;',
      '  pointer-events: none;',
      '}',
      /* Titlebar mode: the band starts below the 40px brand row. */
      '[data-windows-titlebar] div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="logoRow"]::after { top: 44px; height: 54px; }',
      /* Titlebar mode keeps its own 40px brand row. */
      '[data-windows-titlebar] div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="logoRow"] { height: 40px !important; padding-top: 0 !important; padding-left: 0 !important; padding-right: 0 !important; }',

      /* New Session button pinned right below the brand row. */
      'div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="newSession"] {',
      '  position: sticky !important;',
      '  top: 70px !important;',
      '  z-index: 3;',
      '}',
      /* Titlebar mode: the button starts below the 40px brand row. */
      '[data-windows-titlebar] div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="newSession"] { top: 48px !important; }',

      /* The browsing region sizes to its content instead of clipping it. */
      '[class*="regionArea"] { flex: none !important; overflow: visible !important; }',

      /* WorkspaceBrowser internals stop managing their own scroll, so the
         session list renders at full height for the column to scroll. */
      '[class*="regionArea"] [class*="_root"] { flex: none !important; }',
      '[class*="regionArea"] [class*="_listArea"],',
      '[class*="regionArea"] [class*="_treeBody"] { flex: none !important; min-height: 0 !important; }',
      '[class*="regionArea"] [class*="_list"] { flex: none !important; overflow-y: visible !important; }',

      /* The bottom fade belongs to the inner scroll viewport; hide it. */
      '[class*="regionArea"] [class*="_fade"] { display: none !important; }',

      /* The foot stays pinned at the bottom with a full-width opaque
         backdrop, so rows slide beneath it unseen. */
      'div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="footArea"] {',
      '  position: sticky !important;',
      '  bottom: 0 !important;',
      '  z-index: 3;',
      '  margin-left: -12px !important;',
      '  margin-right: -12px !important;',
      '  padding-left: 12px !important;',
      '  padding-right: 12px !important;',
      '  padding-bottom: 6px !important;',
      '  background: var(--dsw-specific-sidebar-fill);',
      '}',
      /* Official fade above the foot: the shipped 24px fade gradient. */
      'div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="footArea"]::after {',
      "  content: '';",
      '  position: absolute;',
      '  left: 0;',
      '  right: 0;',
      '  bottom: 100%;',
      '  height: 24px;',
      '  background: linear-gradient(to bottom, transparent, var(--dsw-specific-sidebar-fill));',
      '  pointer-events: none;',
      '}',
    ].join('\n');

    /** Renders only a stylesheet; unmounting the slot entry removes it. */
    function SidebarScrollFlowStyle() {
      return h('style', {
        'data-plugin': 'dsh-sidebar-scroll-flow',
        'data-plugin-css': 'dsh-sidebar-scroll-flow/sidebar.css',
      }, CSS);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'sidebar-scroll-flow',
          order: 1000,
        }, SidebarScrollFlowStyle));
      },
    };
  },
});
