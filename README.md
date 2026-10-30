# agou-dsh-plugins

DSH (DeepSeek Harness) plugins by [agoudbg](https://github.com/agoudbg).

## Plugins

| Package | Description |
| --- | --- |
| [`dsh-auto-permission-default`](packages/dsh-auto-permission-default) | Selects the Auto review permission preset for every new interactive session. |

## Install

Each directory under `packages/` is an installable DSH bundle. From a local clone of this repository, install one through the DSH Plugin Manager by its absolute package directory, for example:

```
R:\path\to\agou-dsh-plugins\packages\dsh-auto-permission-default
```

Once a package is published to npm or listed in a plugin market index, you can install it from there by name instead.

## Development

This repository is a pnpm workspace:

```sh
pnpm install
```

Each plugin is self-contained plain ESM JavaScript with no build step. Edit the files under `packages/<name>`, then reinstall the bundle to try the change in your DSH profile.

## License

[MIT](LICENSE)
