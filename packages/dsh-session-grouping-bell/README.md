![](icon.svg) **Session Grouping Bell**

Adds a bell next to **Search sessions** in the expanded sidebar. Click it to switch between the single session list and your last grouping view, **WorkSpace** or **Workspace Tree**. The bell returns to whichever grouping you last chose under **View options → Group by**, and the choice is remembered across page reloads.

A dot in the bell's corner summarizes the conversations across the groups: green means at least one conversation has an unread completion; yellow means no unread completions, but a conversation is waiting for your approval, plan review, or answer.

## Install

Requires DSH 0.2.1-rc.5 or later with the Web UI.

```sh
dsh plugin --profile <profile> add dsh-session-grouping-bell
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead.

## License

[MIT](./LICENSE)
