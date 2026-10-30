# dsh-auto-permission-default

Selects the **Auto review** permission preset for every new interactive DSH session.

The permission-presets service deliberately cannot name the runtime-registered `auto` preset as its durable default, so this plugin listens for `session/created` and switches the preset itself:

- New interactive sessions start on the Auto review preset (per-tool LLM authorization review).
- A session whose effective preset already differs from the configured default (an explicit human or stored selection) is left untouched.
- Subagent sessions are skipped entirely.
- If the `auto` preset is not registered (the Auto review feature is unavailable), the plugin does nothing.

## Requirements

- DSH `>=0.2.1-rc.5`
- The `auto` permission preset, registered by DSH's experimental Auto review feature

## Install

From npm, into the profile you boot:

```sh
dsh plugin --profile <profile> add dsh-auto-permission-default
```

Remove it the same way:

```sh
dsh plugin --profile <profile> remove dsh-auto-permission-default
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead:

```
R:\path\to\agou-dsh-plugins\packages\dsh-auto-permission-default
```

## License

[MIT](./LICENSE)
