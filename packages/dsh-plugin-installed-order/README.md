# dsh-plugin-installed-order

Show your installed plugins before the built-in experimental plugins in **Plugins → Installed** in the DSH Web UI.

With the plugin enabled, the groups appear in this order:

1. Built-in plugin configuration
2. Installed plugins
3. Experimental plugins

Disable or uninstall the plugin to restore the original order.

## Requirements

- DSH `>=0.2.1-rc.5`
- The DSH Web UI

Browsers that support CSS `reading-flow` also follow the visual group order when navigating with a keyboard or assistive technology. Other browsers keep their original navigation order.

## Install

In the DSH Plugin Manager, install this package directory by its absolute path:

```text
R:\path\to\agou-dsh-plugins\packages\dsh-plugin-installed-order
```

After a release is published to npm, you can install it into the profile you use to start DSH:

```sh
dsh plugin --profile <profile> add dsh-plugin-installed-order
```

To remove it:

```sh
dsh plugin --profile <profile> remove dsh-plugin-installed-order
```

## License

[MIT](./LICENSE)
