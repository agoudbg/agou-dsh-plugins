DSH 0.2.2-rc.3 and later handle sidebar scrolling natively, so this plugin does nothing on those versions. If you have upgraded, you can remove it from the plugin manager or run:

```sh
dsh plugin --profile <profile> remove dsh-sidebar-scroll-flow
```

On earlier releases, the whole expanded sidebar scrolls as one column. The global rows above the session list — Temporary tasks, Plugins, Automated tasks, More — scroll away together with the list, while the brand row, the **New Session** button, and the settings foot stay in place. The collapsed sidebar keeps its own layout.

## Install

Requires the Web UI and DSH 0.2.1-rc.5 or later, but earlier than 0.2.2-rc.3.

```sh
dsh plugin --profile <profile> add dsh-sidebar-scroll-flow
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead.

## License

[MIT](./LICENSE)
