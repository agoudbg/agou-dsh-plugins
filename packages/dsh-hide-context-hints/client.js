window.__ModuleLoader__.load({
  id: '@agou/dsh-hide-context-hints',
  factory(require) {
    const { createElement } = require('react');
    const CSS = `
[data-chat-flow-kind="context"]:has(> [data-slot="conversation.chat.node"]:empty) {
  display: none;
}
`;

    function HiddenContextHint() {
      return null;
    }

    function HiddenContextStyle() {
      return createElement('style', {
        'data-plugin': '@agou/dsh-hide-context-hints',
      }, CSS);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Process groups add margins even to empty slot anchors.
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'hide-context-hints-style',
        }, HiddenContextStyle));
        // Lower priorities win. The built-in context renderer uses priority 0.
        ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
          name: 'conversation.chat.node',
          key: 'context',
          priority: -10,
        }, HiddenContextHint));
      },
    };
  },
});
