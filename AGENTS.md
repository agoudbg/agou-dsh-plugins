# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm workspace of self-contained DSH (DeepSeek Harness) plugin bundles.

- `packages/<name>/` — one installable plugin per directory: `index.js` (host entry), optional `client.js` (web-side module), `cordis.patch.yml`, `locale/en.json` and `locale/zh.json`, `icon.svg`, `README.md`, `LICENSE`, `package.json`.
- `market/index.json` — generated plugin market index; never edit it by hand.
- `scripts/` — package validation, market index generation, and publish automation.
- `.github/workflows/` — CI checks, npm publish, and the PR version guard.

## Build, Test, and Development Commands

There is no build step; plugins are plain ESM JavaScript. Use Node 22 and pnpm via corepack.

- `pnpm install` — install workspace dependencies.
- `node scripts/check-packages.mjs` — validate manifests, exports, entry syntax, and `npm pack` contents of every package.
- `node scripts/check-market-index.mjs` — verify `market/index.json` matches the packages.
- `node scripts/build-market-index.mjs` — regenerate the market index locally.

To try a change, reinstall the package directory into a DSH profile with `dsh plugin --profile <profile> add <path>`.

## Coding Style & Naming Conventions

- Plain ESM JavaScript, 2-space indentation; double quotes in JSON files.
- Package name must match its directory name and use the `dsh-` prefix (e.g. `dsh-sidebar-scroll-flow`).
- Each manifest needs a valid semver `version`, a non-empty `engines.dsh`, a non-empty `files` array, and `dsh.bundle.patch` pointing at a real file; every `exports` target must resolve.
- Add user-facing strings to both `locale/en.json` and `locale/zh.json`.

## Testing Guidelines

There is no automated test suite. CI runs both check scripts on every push and PR; run them locally before opening a PR. Verify behavior manually by installing the plugin into a DSH profile.

## Commit & Pull Request Guidelines

- Conventional Commits with lowercase, imperative descriptions: `feat: add dsh-sidebar-scroll-flow web sidebar scroll plugin`, `fix:`, `docs:`, `ci:`, `chore:`.
- PRs must pass CI. Do not edit `market/index.json`; CI refreshes it.
- Do not bump `version` in `packages/*/package.json` — the PR Version Guard fails external PRs that do. Maintainers cut releases.

## Releasing

Releases need no commands: a maintainer pushes a `version` bump to `main`, and CI publishes the package to npm, tags `<package>@<version>`, and opens a GitHub Release with generated notes.
