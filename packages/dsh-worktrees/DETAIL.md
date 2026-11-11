A **Local / New local worktree** choice appears next to the workspace and mode menus when you start a conversation. **Local** opens a branch picker and checks out the chosen branch in the source workspace; uncommitted changes stay in the working directory. **New local worktree** creates an isolated copy from the chosen branch when you send the first message: the copy starts at the branch's latest commit without moving the branch, uncommitted changes are not carried over, and the conversation is nudged to create its own task branch before changing files.

Your choice is remembered per workspace.

## Configure

Open **Settings → Worktrees** to choose where new worktrees are created (default: a `worktrees` folder under the DSH data directory) and how many worktrees are kept (default 15, at least 1). The page also lists every worktree with its conversation: you can delete a worktree — a snapshot is saved first — and restore a deleted one from its snapshot when its conversation still exists. Restoring asks for confirmation, and on Windows, restoring saved symlinks requires Developer Mode.

## Install

Requires DSH 0.2.1-rc.5 or later with the Web UI.

```sh
dsh plugin --profile <profile> add dsh-worktrees
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead.

## License

[MIT](./LICENSE)
