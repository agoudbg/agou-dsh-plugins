window.__ModuleLoader__.load({
  id: 'dsh-plugin-installed-order',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const panel = '[role="tabpanel"]'
      + ':has(> section[data-plugin-scope="global"][data-plugin-group="bundles"])'
      + ':has(> section[data-plugin-scope="global"][data-plugin-group="extensions"])';

    // Keep the basic configuration group first. Use the page's semantic markers
    // so translated titles and CSS-module hashes do not affect the ordering.
    const CSS = [
      `${panel} { reading-flow: flex-visual; }`,
      `${panel} > section[data-plugin-scope="global"][data-plugin-group="bundles"] { order: 1; }`,
      `${panel} > section[data-plugin-scope="global"][data-plugin-group="extensions"] { order: 2; }`,
    ].join('\n');

    function PluginInstalledOrderStyle() {
      return h('style', {
        'data-plugin': 'dsh-plugin-installed-order',
        'data-plugin-css': 'dsh-plugin-installed-order/order.css',
      }, CSS);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'plugin-installed-order',
          order: 1000,
        }, PluginInstalledOrderStyle));
      },
    };
  },
});
