![](icon.svg) **Menu Search**

Adds a search box at the top of the menus that list many entries: the workspace picker, the work mode picker, and the branch picker added by the Worktrees plugin. Typing filters the entries in place.

Press Enter to open the first match. Esc clears the search first and closes the menu only when the box is already empty, and the arrow keys move between the search box and the entries as one list.

## Install

Requires DSH 0.2.1-rc.5 or later with the Web UI.

```sh
dsh plugin --profile <profile> add dsh-menu-search
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead.

## License

[MIT](./LICENSE)
