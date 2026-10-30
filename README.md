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

Every push runs `scripts/check-packages.mjs`, which validates manifests, export targets, entry syntax, and the `npm pack` file list of every package.

## Releasing

Releases need no commands: push a `version` bump in a package's `package.json` to `main`, and CI publishes every package whose version is newer than the one on npm. CI then tags `<package>@<version>` and opens a GitHub Release with generated notes.

The pushed version bump is the release confirmation. A version that already exists on npm is skipped, and a version that is not newer than npm's latest fails the run.

Pull requests that edit `version` in `packages/*/package.json` are flagged by the *PR Version Guard* check: external contributors fail it (maintainers cut releases), while maintainer PRs pass with a notice of what merging will publish.

## License

[MIT](LICENSE)
