# ![](icon.svg) Auto Permission Default

**English** | [中文](README-zh-CN.md)

Selects the Auto review permission preset for every new interactive session.

Conversations where you pick another preset keep your choice, and subagent conversations are not affected. When the preset is unavailable in your DSH, the plugin does nothing.

## Install

Requires DSH 0.2.1-rc.5 or later with the Web UI.

```sh
dsh plugin --profile <profile> add dsh-auto-permission-default
```

From a local clone of [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins), install this package directory through the DSH Plugin Manager instead.

## License

[MIT](./LICENSE)
