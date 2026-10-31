# Toggle session grouping

Use the bell immediately to the left of **Search sessions** in the expanded DSH sidebar to switch between one session list and your last workspace grouping. The bell has a rounded highlight in the single-list view. Click it again to restore **WorkSpace** or **Workspace Tree**.

## Install

Requires DSH `0.2.1-rc.5` or later. In the DSH Plugin Manager, install this package directory by its absolute path. You can also install it with the CLI:

```sh
dsh plugin --profile <profile> add /absolute/path/to/packages/dsh-session-grouping-bell
```

Refresh the DSH page after installation.

## Choose the grouped view

Choose **View options → Group by → WorkSpace** or **Workspace Tree** whenever you want to change the view the bell returns to. The bell follows changes made in that menu. Your choice is remembered in this browser across page reloads.

If you first install the plugin while already in the single-list view, its first return target is **WorkSpace**. Choose **Workspace Tree** once to make it the return target. Sorting, archive filtering, and saved workspace expansion follow the existing DSH controls.

The bell hides with the heading while search is expanded. Close search to show it again. The collapsed sidebar keeps its existing search and add actions.

## Conversation indicators

A dot in the bell's upper-right corner summarizes conversations across workspace groups, including collapsed groups and rows beyond **Show more**:

- Green means at least one conversation has an unread completion.
- Yellow means there are no unread completions, but a conversation is awaiting approval, plan review, or an answer.
- No dot means neither condition applies. Running alone does not add a dot.

The indicator updates with the session list's own UI status. Archived conversations, subagent-only entries, and hidden blank sessions do not contribute. Opening a conversation clears its unread reminder through DSH's existing behavior. The dot uses the session list's success/warning theme colors and 6px visible diameter.

## Compatibility

DSH `0.2.1-rc.5` has no header-action slot. This plugin decorates the existing `sidebar.workspaces` registration, reusing its viewing store, injected operations, and child slots. It adds the button to the heading's React elements without changing translations, querying the DOM, or loading internal DSH client modules. Its adapter expects the v5 workspace viewing store and the existing header structure. DSH changes to that structure require checking the adapter again.

Disabling the plugin restores the shipped browser. The browser's selected grouping remains in effect.

## Verify

Run the repository checks from the workspace root:

```sh
node scripts/check-packages.mjs
node scripts/check-market-index.mjs
node --check packages/dsh-session-grouping-bell/client.js
node --test packages/dsh-session-grouping-bell/client.test.js
```

In DSH, check that each grouped mode returns after two bell clicks, menu changes update the return target, and the single-list highlight survives a page reload. Expand and close search, then collapse and expand the sidebar. Confirm that each state shows one bell where applicable and that session row extensions still appear.

## License

MIT. The bell glyph is from Lucide under the ISC license. Both notices are included in [LICENSE](LICENSE).
