# dsh-scrollbar-edge-hit

Makes the **right-edge scrollbars** of the DSH Web UI reachable at the window edge.

## The problem

The theme draws a 5px custom scrollbar (`--dsh-scrollbar-width: 5px`), and the scroll containers that touch the window's right edge — the conversation page (`.scrollBody`) and the Files side panel (`.body`) — carry `margin-right: 2px`. The scrollbar's draggable strip therefore ends 2px before the window edge, and that strip belongs to the parent column. With the mouse pushed fully against the right edge of the window, the scrollbar cannot be grabbed; you have to back off a pixel or two first.

## The fix

The plugin re-uses the scrollbar pattern the shipped Schedule page already uses: a **9px scrollbar whose thumb carries a 2px transparent border** (`background-clip: content-box`):

- The visible thumb stays a 5px bar floating 2px in from the edge — pixel-for-pixel where it is today.
- The draggable strip becomes the full 9px and now reaches the window edge, so the mouse slammed to the right edge lands on the scrollbar.
- `margin-right: 2px` is removed from both containers so the scrollbar sits flush at the edge; `scrollbar-gutter: stable` just reserves 9px instead of 5px.

Scope: `[data-conversation-scroll]` (conversation page) and `[data-files-body]` (Files panel) — the two containers whose scrollbar sits at the window's right edge. The sidebar session list, the composer textarea, and dialog scrollers keep their shipped geometry. Those attributes are the stable public hooks the shipped code itself queries, so CSS-module hash changes on rebuild do not break the selectors.

A DSH update that changes the scrollbar custom properties (`--dsh-scrollbar-width`, `--dsh-scrollbar-thumb-border`) or the 2px edge offset needs this sheet revisited.

## Requirements

- DSH `>=0.2.1-rc.5`
- The DSH Web UI (the plugin's client half targets the `web` platform)

## Install

From npm, into the profile you boot:

```sh
dsh plugin --profile <profile> add dsh-scrollbar-edge-hit
```

Remove it the same way:

```sh
dsh plugin --profile <profile> remove dsh-scrollbar-edge-hit
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead:

```
R:\path\to\agou-dsh-plugins\packages\dsh-scrollbar-edge-hit
```

## License

[MIT](./LICENSE)
