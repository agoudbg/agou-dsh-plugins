# dsh-menu-search

Adds a **search field** to the DSH Web UI menus that list many entries: the workspace picker, the work mode picker, and the branch picker from [dsh-worktrees](../dsh-worktrees).

## What it does

A menu that gains the field shows a search row at the very top of the popup, one icon plus a text input. Typing filters the entries in place; `Enter` opens the first remaining entry; `Esc` clears the query first and only closes the menu once the field is already empty. `Up` and `Down` walk the field and the entries as one cycle, so the arrow keys never strand the user in one of the two.

## How it stays native

The field is an extra row inserted into the shipped menu panel, between its translucent material layer and its scrollable viewport. The menu component, its classes, and its inline positioning style are left untouched, so every other pixel of the popup — width, item metrics, hover fill, footer, enter/exit animation — is the shipped one. Filtering hides the non-matching rows by toggling their own `display` and `disabled` state, which the menu's own keyboard handling already respects. On the first keystroke the search row pins itself to the width the viewport had at that moment, so hiding rows never shrinks the popup under the cursor.

Only menus opened from a whitelisted trigger are decorated:

| Menu | Trigger hook |
| --- | --- |
| Workspace picker | `[class*="heroWorkspaceRow"] > button[aria-haspopup="menu"]` |
| Work mode (agent preset) | `[data-slot="conversation.hero.agentPreset"] button[aria-haspopup="menu"]` |
| Branch picker (dsh-worktrees) | `[data-slot="conversation.hero.options"] > .dsh-worktrees-anchor:last-child > button.dsh-worktrees-seat` |

The other dsh-worktrees seat switches between a local and a new worktree. Its menu holds those two entries and keeps its shipped look: the distinction is visible without filtering, and a field would only add a row.

A menu is recognised by the single trigger that reports itself expanded while the panel is on screen. No pointer history is involved, so a different menu opened right after a decorated one is left alone. When the opening state or the entry list has not landed yet, the panel is looked at again on the next frames until it settles.

Other plugins can opt a trigger in by marking it with a `data-menu-search-trigger` attribute. Every other menu in the page — session context menus, the account menu, the model picker — keeps its shipped behavior.

The selectors key off stable hooks (`data-slot`, `data-menu-material`, `role="menu"`, `aria-haspopup`) rather than CSS-module hashes, so a DSH rebuild does not break them. A DSH update that changes the menu panel's internal structure — the material layer, the `role="presentation"` viewport, or the `button[role="menuitem"]` rows — needs this plugin revisited.

## Requirements

- DSH `>=0.2.1-rc.5`
- The DSH Web UI (the plugin's client half targets the `web` platform)

## Install

From npm, into the profile you boot:

```sh
dsh plugin --profile <profile> add dsh-menu-search
```

Remove it the same way:

```sh
dsh plugin --profile <profile> remove dsh-menu-search
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead:

```
R:\path\to\agou-dsh-plugins\packages\dsh-menu-search
```

## License

[MIT](./LICENSE)
