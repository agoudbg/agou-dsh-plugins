# <img src="icon.svg" alt="隐藏上下文提示图标" width="36" height="36" align="absmiddle" /> 隐藏上下文提示

<sup>[English](README.md) | **中文**</sup>

隐藏 DSH 会话中的上下文注入提示。

启用“隐藏上下文提示”后，会话中的“上下文注入”折叠行会隐藏，包括工作区指令、运行环境、技能目录和时间信息。插件适用于已有会话和新会话，也会隐藏会话过程中后续注入的同类提示。

模型仍会收到这些上下文，原始会话记录也会保存。普通消息、工具调用和错误提示保持正常显示。工作过程分组的摘要仍可能提到上下文注入。

## 安装

需要 DSH 0.2.2-rc.3 或更新版本的 Web 界面。

从本地克隆的 [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins) 仓库中，在 DSH 插件管理器里添加 `packages/dsh-hide-context-hints` 目录。

## 恢复显示

在插件管理器里停用“隐藏上下文提示”，即可恢复上下文提示的显示，包括已有会话中的提示。

## 许可证

[MIT](./LICENSE)
