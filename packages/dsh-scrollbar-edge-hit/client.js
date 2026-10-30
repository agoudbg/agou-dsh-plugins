window.__ModuleLoader__.load({
  id: 'dsh-scrollbar-edge-hit',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /**
     * Scrollbar edge hit-area fix.
     *
     * Shipped geometry (ui-conversation `.scrollBody`, ui-sidebar-files
     * `.body`): the scroll container keeps `margin-right: 2px` with the theme
     * default `--dsh-scrollbar-width: 5px`, so the scrollbar's hit strip ends
     * 2px before the window edge. Pushing the mouse fully against the right
     * edge lands on the parent column instead of the scrollbar, and the bar
     * cannot be grabbed there.
     *
     * This sheet re-uses the pattern the shipped Schedule page already uses
     * (`.pageScroll`): a 9px scrollbar whose thumb carries a 2px transparent
     * border. The visible thumb stays a 5px bar floating 2px in from the edge,
     * pixel-for-pixel where it is today, while the draggable strip becomes the
     * full 9px and reaches the window edge. The margin-right is dropped so the
     * scrollbar itself sits flush at the edge.
     *
     * Selectors anchor on the public `data-conversation-scroll` and
     * `data-files-body` attributes the shipped code itself queries, so
     * rebuilds that change CSS-module hashes keep working.
     */
    const CSS = [
      /* Main conversation scroll: hit area to the window edge. */
      '[data-conversation-scroll] {',
      '  --dsh-scrollbar-width: 9px;',
      '  --dsh-scrollbar-thumb-border: 2px;',
      '  margin-right: 0 !important;',
      '}',
      /* Files side panel: the same dead strip at the window edge. */
      '[data-files-body] {',
      '  --dsh-scrollbar-width: 9px;',
      '  --dsh-scrollbar-thumb-border: 2px;',
      '  margin-right: 0 !important;',
      '}',
    ].join('\n');

    /** Renders only a stylesheet; unmounting the slot entry removes it. */
    function ScrollbarEdgeHitStyle() {
      return h('style', {
        'data-plugin': 'dsh-scrollbar-edge-hit',
        'data-plugin-css': 'dsh-scrollbar-edge-hit/scrollbar.css',
      }, CSS);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'scrollbar-edge-hit',
          order: 1000,
        }, ScrollbarEdgeHitStyle));
      },
    };
  },
});
