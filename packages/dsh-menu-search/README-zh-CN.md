# <img src="icon.svg#svgView(viewBox(6.4,6.4,30.25,27.5))" alt="菜单搜索图标" width="40" height="36" align="absmiddle" /> 菜单搜索

<sup>[English](README.md) | **中文**</sup>

为工作区、工作模式和分支菜单添加搜索框。

输入即可过滤菜单条目。回车打开第一个匹配项；Esc 先清空搜索词，搜索词为空时才关闭菜单；上下方向键在搜索框和条目之间连续移动。

## 安装

需要 DSH 0.2.1-rc.5 或更高版本，并使用网页界面。

```sh
dsh plugin --profile <profile> add dsh-menu-search
```

也可以克隆 [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins) 仓库，在插件管理器中通过本包目录的绝对路径安装。

## 许可证

[MIT](./LICENSE)
