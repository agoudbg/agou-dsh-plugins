![Agou DSH Plugins](docs/assets/brand/banner.svg)

# agou-dsh-plugins

<sup>**English** | [中文](README-zh-CN.md)</sup>

DSH (DeepSeek Harness) plugins by [agoudbg](https://github.com/agoudbg).

## Plugins

<!-- BEGIN AUTO-GENERATED PLUGIN LIST: DO NOT EDIT -->

### <img src="packages/dsh-auto-permission-default/icon.svg#svgView(viewBox(6.5,6.5,23,23))" alt="Auto Permission Default icon" width="25" height="25" align="top" /> [Auto Permission Default](packages/dsh-auto-permission-default)

Selects the Auto review permission preset for every new interactive session.

### <img src="packages/dsh-model-effort-memory/icon.svg#svgView(viewBox(7.5,7.5,22,22))" alt="Remember Model Effort icon" width="25" height="25" align="top" /> [Remember Model Effort](packages/dsh-model-effort-memory)

Keeps each model's last selected reasoning effort when switching models.

### <img src="packages/dsh-pasted-text-file/icon.svg#svgView(viewBox(7.5,6.5,24,24))" alt="Pasted Text Attachment icon" width="25" height="25" align="top" /> [Pasted Text Attachment](packages/dsh-pasted-text-file)

Paste long text as an attachment.

### <img src="packages/dsh-plugin-installed-order/icon.svg#svgView(viewBox(6.8,6,25.5,25.5))" alt="Installed Plugins First icon" width="25" height="25" align="top" /> [Installed Plugins First](packages/dsh-plugin-installed-order)

Shows installed plugins before built-in experimental plugins on the Installed tab.

### <img src="packages/dsh-scrollbar-edge-hit/icon.svg#svgView(viewBox(7,7,23,23))" alt="Edge-Reachable Scrollbar icon" width="25" height="25" align="top" /> [Edge-Reachable Scrollbar](packages/dsh-scrollbar-edge-hit)

Makes the scrollbar usable with the mouse at the screen edge.

### <img src="packages/dsh-session-grouping-bell/icon.svg#svgView(viewBox(7,6.5,24.5,24.5))" alt="Session grouping bell icon" width="25" height="25" align="top" /> [Session grouping bell](packages/dsh-session-grouping-bell)

Quickly switch to the single-list view.

### <img src="packages/dsh-session-workspace-label/icon.svg#svgView(viewBox(7,7.5,21.5,21.5))" alt="Session workspace labels icon" width="25" height="25" align="top" /> [Session workspace labels](packages/dsh-session-workspace-label)

Displays workspace names by group in single-list mode.

### <img src="packages/dsh-sidebar-scroll-flow/icon.svg#svgView(viewBox(6.5,6.5,23.5,23.5))" alt="Sidebar Scroll Flow icon" width="25" height="25" align="top" /> [Sidebar Scroll Flow](packages/dsh-sidebar-scroll-flow)

Increases the display area for the conversation list in the sidebar.

### <img src="packages/dsh-worktrees/icon.svg#svgView(viewBox(7.5,7.5,21.5,21.5))" alt="Worktrees icon" width="25" height="25" align="top" /> [Worktrees](packages/dsh-worktrees)

Choose a Git branch or a new local worktree for each conversation, with recoverable background cleanup.

<!-- END AUTO-GENERATED PLUGIN LIST -->

## Install

Each package under `packages/` is an installable DSH bundle, published to npm on release. Install one into the profile you boot with the DSH CLI (`dsh plugin` forwards its arguments to pnpm in the profile directory):

```sh
dsh plugin --profile <profile> add <package>
```

For example: `dsh plugin --profile web add dsh-auto-permission-default`.

From a local clone of this repository, you can also install a package directory through the DSH Plugin Manager by its absolute path, for example:

```
R:\path\to\agou-dsh-plugins\packages\dsh-auto-permission-default
```

This repository also serves a plugin market index at [`market/index.json`](market/index.json). Add

```
https://raw.githubusercontent.com/agoudbg/agou-dsh-plugins/main/market/index.json
```

as an index source in your DSH plugin market settings to browse and install these plugins from the market page.

## Development

Regenerate the banner and icon with `pnpm artwork:generate`. To compare a local reference image, run `pnpm artwork:compare --reference <path-to-reference.png>`. Comparison outputs stay in `.tmp/artwork/qa`. See [artwork generation](docs/artwork.md) for the repeat policy and output files.

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

The plugin market index at `market/index.json` and the plugin sections in both READMEs are generated by `scripts/build-market-index.mjs` from package manifests, locale files, icons, and git history. Do not edit the generated sections by hand. CI validates the outputs on every push and commits a refreshed copy back to `main` whenever they drift. Each npm publish is recorded in `market/published.json`, which turns that version's install source into npm.

## License

[MIT](LICENSE)
