# <img src="icon.svg#svgView(viewBox(7.5,7.5,30.25,27.5))" alt="Remember Model Effort icon" width="40" height="36" align="absmiddle" /> Remember Model Effort

<sup>**English** | [中文](README-zh-CN.md)</sup>

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
