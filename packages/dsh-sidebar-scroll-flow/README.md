# ![](icon.svg) Sidebar Scroll Flow

**English** | [中文](README-zh-CN.md)

Increases the display area for the conversation list in the sidebar.

The whole expanded sidebar scrolls as one column. The global rows above the session list — Temporary tasks, Plugins, Automated tasks, More — scroll away together with the list, while the brand row, the **New Session** button, and the settings foot stay in place. The collapsed sidebar keeps its own layout.

## Install

Requires DSH 0.2.1-rc.5 or later with the Web UI.

```sh
dsh plugin --profile <profile> add dsh-sidebar-scroll-flow
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead.

## License

[MIT](./LICENSE)
