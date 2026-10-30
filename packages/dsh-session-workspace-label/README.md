# dsh-session-workspace-label

See which workspace each conversation belongs to while browsing the sidebar in **In one list** mode. This plugin adds the workspace name below each existing session title.

## Install

Requires DSH `>=0.2.1-rc.5` with the Web UI.

Install this package directory by its absolute path in the DSH Plugin Manager. After a published release, you can also install it with:

```sh
dsh plugin --profile <profile> add dsh-session-workspace-label
```

## Use

Open **View options** above the sidebar's session list and choose **In one list** under **Group by**. Each existing session shows its registered workspace name on a second line. Long names end with an ellipsis. A session outside registered workspaces shows **Ungrouped**.

Workspace names follow workspace renames. The automatic default workspace name follows the interface language. Workspace grouping, workspace-tree grouping, and search results keep their existing layout. A blank **New Session** row keeps its existing layout until you send its first message.

Disable the plugin in the Plugin Manager to return to the original session rows.

## Compatibility

The plugin targets the Web sidebar layout in DSH `0.2.1-rc.5`. Future DSH versions that change the sidebar's CSS class suffixes or row-action structure may require a plugin update.

## 中文

在侧栏会话列表上方打开“视图选项”，将“分组方式”切换为“单列表”。每个已有会话的标题下方会显示所属工作区名称，长名称用省略号收尾，没有所属工作区的会话显示“未分组”。

工作区改名后，第二行会跟着更新。默认工作区名称跟随界面语言。工作区分组、工作区树和搜索结果保持原有布局。空白的“新会话”条目会在发送第一条消息后显示第二行。

在插件管理页面停用“会话工作区标签”，就能恢复原来的会话行。

## License

MIT
