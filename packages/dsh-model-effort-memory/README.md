# ![](icon.svg) Remember Model Effort

**English** | [中文](README-zh-CN.md)

Keeps each model's last selected reasoning effort when switching models.

A model that no longer offers the saved level falls back to its default. The memory is kept per model in this browser and survives page reloads.

## Install

Requires DSH 0.2.1-rc.5 or later with the Web UI.

```sh
dsh plugin --profile <profile> add dsh-model-effort-memory
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead.

## License

[MIT](./LICENSE)
