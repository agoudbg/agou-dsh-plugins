# dsh-sidebar-scroll-flow

Scrolls the whole **web sidebar** as one column in the DSH Web UI.

The shipped layout keeps the global panel rows (Temporary tasks, Plugins, Automated tasks, More) fixed above the browsing region, so only the session list scrolls. This plugin moves the scroll boundary to the sidebar column itself:

- The panel rows scroll away together with the session list.
- The brand row, the New Session button, and the settings foot stay pinned (`position: sticky`) with opaque backdrops, so rows slide beneath them unseen.
- A hairline above the New Session button fades in over the first pixels of scrolling (scroll-driven animation).
- The collapsed rail keeps its own layout and never scrolls.
- Windows titlebar mode keeps its shorter 40px brand row, with pinned offsets adjusted.

The plugin is a style-only overlay: selectors anchor on the readable suffixes of the shipped CSS-module class tokens (`..._panelList`, `..._regionArea`, ...), so rebuilds that change the hashes keep working. A DSH update that renames those class suffixes or restructures the sidebar needs the style sheet updated.

## Requirements

- DSH `>=0.2.1-rc.5`
- The DSH Web UI (the plugin's client half targets the `web` platform)

## Install

From npm, into the profile you boot:

```sh
dsh plugin --profile <profile> add dsh-sidebar-scroll-flow
```

Remove it the same way:

```sh
dsh plugin --profile <profile> remove dsh-sidebar-scroll-flow
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead:

```
R:\path\to\agou-dsh-plugins\packages\dsh-sidebar-scroll-flow
```

## License

[MIT](./LICENSE)
