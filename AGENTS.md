# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm workspace of self-contained DSH (DeepSeek Harness) plugin bundles.

- `packages/<name>/` — one installable plugin per directory: `index.js` (host entry), optional `client.js` (web-side module), `cordis.patch.yml`, `locale/en.json` and `locale/zh.json`, `icon.svg`, `README.md`, `LICENSE`, `package.json`.
- `market/index.json` — generated plugin market index; never edit it by hand.
- `scripts/` — package validation, market index generation, artwork generation, and publish automation.
- `.github/workflows/` — CI checks, npm publish, the PR version guard, and the banner artwork refresh.

## Build, Test, and Development Commands

There is no build step; plugins are plain ESM JavaScript. Use Node 22 and pnpm via corepack.

- `pnpm install` — install workspace dependencies.
- `node scripts/check-packages.mjs` — validate manifests, exports, entry syntax, and `npm pack` contents of every package.
- `node scripts/check-market-index.mjs` — verify `market/index.json` matches the packages.
- `node scripts/build-market-index.mjs` — regenerate the market index locally.
- `node scripts/generate-artwork.mjs` — regenerate the banner and icon artwork; `node scripts/refresh-artwork.mjs` also reports drift from the committed plugin icons.

To try a change, reinstall the package directory into a DSH profile with `dsh plugin --profile <profile> add <path>`.

## Coding Style & Naming Conventions

- Plain ESM JavaScript, 2-space indentation; double quotes in JSON files.
- Package name must match its directory name and use the `dsh-` prefix (e.g. `dsh-sidebar-scroll-flow`). A scoped npm name `@agou/dsh-<name>` maps to the directory `dsh-<name>`.
- Before creating a new package, confirm the npm name is available with `npm view <name>` (a lookup failure means the name is free). npm names are globally unique; a taken name fails the publish run with 403 and forces a scoped rename.
- Each manifest needs a valid semver `version`, a non-empty `engines.dsh`, a non-empty `files` array, and `dsh.bundle.patch` pointing at a real file; every `exports` target must resolve.
- Add user-facing strings to both `locale/en.json` and `locale/zh.json`.

## Testing Guidelines

There is no automated test suite. CI runs both check scripts on every push and PR; run them locally before opening a PR. Verify behavior manually by installing the plugin into a DSH profile.

## Commit & Pull Request Guidelines

- Conventional Commits with lowercase, imperative descriptions: `feat: add dsh-sidebar-scroll-flow web sidebar scroll plugin`, `fix:`, `docs:`, `ci:`, `chore:`.
- PRs must pass CI. Do not edit `market/index.json`; CI refreshes it.
- Do not bump `version` in `packages/*/package.json` — the PR Version Guard fails external PRs that do. Maintainers cut releases.

## Releasing

Releases need no commands: a maintainer pushes a `version` bump to `main`, and CI stages the package on npm (`npm stage publish`), tags `<package>@<version>`, and opens a GitHub Release with generated notes. The version goes public when a maintainer approves it on npmjs.com (Staged Packages tab, 2FA).
