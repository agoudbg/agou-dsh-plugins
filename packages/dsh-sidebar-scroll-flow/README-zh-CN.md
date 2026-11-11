# <img src="icon.svg#svgView(viewBox(6.5,6.5,32.3125,29.375))" alt="侧边栏整体滚动图标" width="40" height="36" align="absmiddle" /> 侧边栏整体滚动

<sup>[English](README.md) | **中文**</sup>

增大对话列表在侧边栏的显示区域。

让展开的侧边栏作为一列整体滚动。会话列表上方的临时任务、插件、自动化任务、更多等全局入口会随列表一起滚出屏幕；品牌行、“新会话”按钮和底部的设置区保持固定。收起后的侧边栏不受影响。

## 安装

需要 DSH 0.2.1-rc.5 或更高版本，并使用网页界面。

```sh
dsh plugin --profile <profile> add dsh-sidebar-scroll-flow
```

也可以克隆 [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins) 仓库，在插件管理器中通过本包目录的绝对路径安装。

## 许可证

[MIT](./LICENSE)
