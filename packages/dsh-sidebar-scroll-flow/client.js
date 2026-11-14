window.__ModuleLoader__.load({
  id: 'dsh-sidebar-scroll-flow',
  factory(require) {
    /** Compare the Host release with the fixed native-scroll boundary, 0.2.2-rc.3. */
    function hasNativeSidebarScroll(version) {
      // Older Hosts do not publish a release identity in the boot graph.
      if (version === undefined) return false;
      const match = typeof version === 'string'
        ? /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version)
        : null;
      if (match === null) throw new Error('dsh-sidebar-scroll-flow: invalid DSH release version');
      const core = match.slice(1, 4).map(Number);
      const boundary = [0, 2, 2];
      for (let index = 0; index < core.length; index += 1) {
        if (core[index] !== boundary[index]) return core[index] > boundary[index];
      }
      if (match[4] === undefined) return true;
      const [channel, sequence] = match[4].split('.');
      // Numeric prerelease identifiers sort before the nonnumeric "rc" identifier.
      if (channel !== 'rc') return !/^\d+$/.test(channel) && channel > 'rc';
      if (sequence === undefined) return false;
      return !/^\d+$/.test(sequence) || Number(sequence) >= 3;
    }

    if (hasNativeSidebarScroll(window.__DSH_BOOT__?.release?.version)) {
      return { apply() {} };
    }

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
     * Column widening rides on the shipped `--dsh-sidebar-inline-padding`
     * custom property, so the widened rows end exactly at the padding edge and
     * never create horizontal scroll slack. The vertical anchors (sticky tops,
     * backdrop band) match the 0.2.2-rc.1 geometry: a 60px brand row, a 38px
     * New Session button with a 10px bottom margin (46px top offset in
     * titlebar mode).
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

      /* Brand row pinned at the top, widened to the full column by exactly
         the shipped inline padding; content keeps the shipped inset. */
      'div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="logoRow"] {',
      '  position: sticky !important;',
      '  top: 0 !important;',
      '  z-index: 3;',
      '  margin-left: calc(-1 * var(--dsh-sidebar-inline-padding, 12px)) !important;',
      '  margin-right: calc(-1 * var(--dsh-sidebar-inline-padding, 12px)) !important;',
      '  padding-left: 16px !important;',
      '  padding-right: var(--dsh-sidebar-inline-padding, 12px) !important;',
      '  background: var(--dsw-specific-sidebar-fill);',
      '  box-shadow: 0 4px 0 0 var(--dsw-specific-sidebar-fill);',
      '  /* the seam backdrop below is a pseudo of this row */',
      '  overflow: visible !important;',
      '}',
      /* Opaque backdrop behind the pinned New Session button: it stacks under
         the button but over the session rows, so rows scrolling underneath
         stay hidden, and its hairline is the line rows disappear at. It starts
         at the natural brand-row height (top: 100%) and covers the button
         plus its bottom margin (38px + 10px). */
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
      '  top: 100%;',
      '  left: 0;',
      '  right: 0;',
      '  box-sizing: border-box;',
      '  height: 48px;',
      '  background: var(--dsw-specific-sidebar-fill);',
      '  border-bottom: .5px solid var(--dsw-alias-border-l3);',
      '  animation: sidebar-scroll-flow-line linear both;',
      '  animation-timeline: scroll(nearest block);',
      '  animation-range: 0 12px;',
      '  pointer-events: none;',
      '}',
      /* Titlebar mode keeps its own 40px brand row unwidened; the band then
         covers the button (46px flow top, 38px + 6px top margin, 10px bottom
         margin) down to the panel list start. */
      '[data-windows-titlebar] div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="logoRow"] { margin-left: 0 !important; margin-right: 0 !important; padding-left: 0 !important; padding-right: 0 !important; }',
      '[data-windows-titlebar] div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="logoRow"]::after { height: 54px; }',

      /* New Session button pinned right below the brand row (its natural 60px
         height, 46px in titlebar mode: 40px row + 6px button margin-top). */
      'div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="newSession"] {',
      '  position: sticky !important;',
      '  top: 60px !important;',
      '  z-index: 3;',
      '}',
      '[data-windows-titlebar] div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="newSession"] { top: 46px !important; }',

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

      /* Auto margin fills spare height for short lists; sticky keeps the foot
         pinned while long lists scroll beneath its full-width backdrop. */
      'div:has(> [class*="panelList"]):has(> [class*="regionArea"]):not([class*="collapsed"]) > [class*="footArea"] {',
      '  position: sticky !important;',
      '  bottom: 0 !important;',
      '  z-index: 3;',
      '  margin-top: auto !important;',
      '  margin-left: calc(-1 * var(--dsh-sidebar-inline-padding, 12px)) !important;',
      '  margin-right: calc(-1 * var(--dsh-sidebar-inline-padding, 12px)) !important;',
      '  padding-left: var(--dsh-sidebar-inline-padding, 12px) !important;',
      '  padding-right: var(--dsh-sidebar-inline-padding, 12px) !important;',
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
