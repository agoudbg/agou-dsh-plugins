# agou-dsh-plugins

<sup>[English](README.md) | **中文**</sup>

由 [agoudbg](https://github.com/agoudbg) 开发的 DSH（DeepSeek Harness）插件。

## 插件

<!-- BEGIN AUTO-GENERATED PLUGIN LIST: DO NOT EDIT -->

### <img src="packages/dsh-auto-permission-default/icon.svg" alt="自动审查默认权限图标" width="36" height="36" align="left" /> [自动审查默认权限](packages/dsh-auto-permission-default)

让每个新建交互会话默认使用“自动审查”权限预设。

### <img src="packages/dsh-model-effort-memory/icon.svg" alt="记住模型推理强度图标" width="36" height="36" align="left" /> [记住模型推理强度](packages/dsh-model-effort-memory)

切换模型时恢复每个模型上次选择的推理强度。

### <img src="packages/dsh-pasted-text-file/icon.svg" alt="长文本粘贴附件图标" width="36" height="36" align="left" /> [长文本粘贴附件](packages/dsh-pasted-text-file)

将长文本粘贴为附件。

### <img src="packages/dsh-plugin-installed-order/icon.svg" alt="已安装插件优先图标" width="36" height="36" align="left" /> [已安装插件优先](packages/dsh-plugin-installed-order)

在插件管理的“已安装”页面中，将“已安装插件”排在内置实验性插件前面。

### <img src="packages/dsh-scrollbar-edge-hit/icon.svg" alt="滚动条贴边可用图标" width="36" height="36" align="left" /> [滚动条贴边可用](packages/dsh-scrollbar-edge-hit)

让滚动条在鼠标位于屏幕边缘时可用。

### <img src="packages/dsh-session-grouping-bell/icon.svg" alt="会话分组铃铛图标" width="36" height="36" align="left" /> [会话分组铃铛](packages/dsh-session-grouping-bell)

快速切换到单列表视图。

### <img src="packages/dsh-session-workspace-label/icon.svg" alt="会话工作区标签图标" width="36" height="36" align="left" /> [会话工作区标签](packages/dsh-session-workspace-label)

在单列表模式分组显示工作区名称。

### <img src="packages/dsh-sidebar-scroll-flow/icon.svg" alt="侧边栏整体滚动图标" width="36" height="36" align="left" /> [侧边栏整体滚动](packages/dsh-sidebar-scroll-flow)

增大对话列表在侧边栏的显示区域。

### <img src="packages/dsh-worktrees/icon.svg" alt="工作树图标" width="36" height="36" align="left" /> [工作树](packages/dsh-worktrees)

为会话选择 Git 分支或新建本地工作树，支持保存快照后自动清理和恢复。

<!-- END AUTO-GENERATED PLUGIN LIST -->

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

插件市场索引 `market/index.json` 和两份 README 中的插件区块都由 `scripts/build-market-index.mjs` 根据包清单、本地化文件、图标和 Git 历史生成。生成区块不能手动编辑。CI 会在每次推送时验证这些输出；如果它们发生变化，CI 会生成刷新后的副本并提交回 `main`。每次 npm 发布都会记录在 `market/published.json` 中，该记录会把对应版本的安装来源切换为 npm。

## 许可证

[MIT](LICENSE)
