Enable **Hide context hints** to remove the collapsed context injection rows from your conversations, including workspace instructions, runtime context, skill catalogs, and time context. The plugin applies to existing and new conversations, including context injected later in a conversation.

The model still receives the context, and the original session records stay available. Ordinary messages, tool calls, and error notices keep their usual display. Process-group summaries can still mention injected context.

## Install

Requires DSH 0.2.2-rc.3 or later with the Web UI.

In DSH's Plugin Manager, add the local `packages/dsh-hide-context-hints` directory from your clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins).

## Show context hints again

Disable **Hide context hints** in the Plugin Manager to restore the context rows, including rows in earlier conversations.

## License

[MIT](./LICENSE)
