# agou-dsh-plugins

<sup>[English](README.md) | **中文**</sup>

由 [agoudbg](https://github.com/agoudbg) 开发的 DSH（DeepSeek Harness）插件。

## 插件

| 包 | 说明 |
| --- | --- |
| [`dsh-auto-permission-default`](packages/dsh-auto-permission-default) | 为每个新建的交互式 DSH 会话选择 Auto review 权限预设。 |
| [`dsh-pasted-text-file`](packages/dsh-pasted-text-file) | 将粘贴的长文本作为附件。 |
| [`dsh-plugin-installed-order`](packages/dsh-plugin-installed-order) | 在“已安装”标签页中，将已安装插件显示在内置实验性插件之前。 |
| [`dsh-scrollbar-edge-hit`](packages/dsh-scrollbar-edge-hit) | 让对话和文件面板的滚动条可以在窗口最右侧拖动。 |
| [`dsh-session-grouping-bell`](packages/dsh-session-grouping-bell) | 添加铃铛，用于在单列表和最近的工作区分组之间切换会话列表。 |
| [`dsh-session-workspace-label`](packages/dsh-session-workspace-label) | 在侧边栏的单列表视图中，于每个会话标题下方显示工作区名称。 |
| [`dsh-sidebar-scroll-flow`](packages/dsh-sidebar-scroll-flow) | 让 Web 侧边栏作为单列滚动：面板行会和会话列表一起移出视野，同时固定品牌、新建会话和底部区域。 |
| [`dsh-worktrees`](packages/dsh-worktrees) | 在会话中选择 Git 分支和本地工作树，并提供快照、后台清理和侧边栏详情。 |

## 安装

`packages/` 下的每个包都是可安装的 DSH bundle，发布时会上传到 npm。请将所需包安装到你通过 DSH CLI 启动的 profile 中（`dsh plugin` 会把参数转发给 profile 目录中的 pnpm）：

```sh
dsh plugin --profile <profile> add <package>
```

例如：`dsh plugin --profile web add dsh-auto-permission-default`。

从本地克隆的仓库安装时，也可以通过 DSH Plugin Manager 添加包目录的绝对路径。例如：

```
R:\path\to\agou-dsh-plugins\packages\dsh-auto-permission-default
```

本仓库还提供插件市场索引 [`market/index.json`](market/index.json)。在 DSH 插件市场设置中，将下面的地址添加为索引源，即可从市场页面浏览和安装这些插件：

```
https://raw.githubusercontent.com/agoudbg/agou-dsh-plugins/main/market/index.json
```

## 开发

本仓库是一个 pnpm workspace：

```sh
pnpm install
```

每个插件都是自包含的纯 ESM JavaScript，无需构建。编辑 `packages/<name>` 下的文件，然后重新安装 bundle，即可在 DSH profile 中试用改动。

每次推送都会运行 `scripts/check-packages.mjs`。该脚本会检查每个包的清单、导出目标、入口语法和 `npm pack` 文件列表。

## 发布

发布无需额外命令：将包 `package.json` 中的 `version` 更新推送到 `main` 后，CI 会发布所有版本高于 npm 当前版本的包。随后 CI 会创建 `<package>@<version>` 标签，并根据生成的变更说明创建 GitHub Release。

推送的版本更新就是发布确认。npm 上已经存在的版本会跳过，低于或等于 npm 最新版本的版本会导致运行失败。

修改 `packages/*/package.json` 中 `version` 的拉取请求会被 *PR Version Guard* 检查标记：外部贡献者会因此检查失败，维护者则会收到合并后将发布哪些包的提示。

插件市场索引 `market/index.json` 由 `scripts/build-market-index.mjs` 根据包清单、本地化文件、图标和 Git 历史生成，不能手动编辑。CI 会在每次推送时验证它；如果索引发生变化，CI 会生成刷新后的副本并提交回 `main`。每次 npm 发布都会记录在 `market/published.json` 中，该记录会把对应版本的安装来源切换为 npm。

## 许可证

[MIT](LICENSE)
