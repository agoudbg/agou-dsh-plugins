<p>
  <picture>
    <!-- Keep commas encoded in srcset so GitHub preserves the SVG view fragment. -->
    <source media="(max-width: 600px)" srcset="docs/assets/brand/banner.svg#svgView(viewBox(320%2C0%2C640%2C380))">
    <img src="docs/assets/brand/banner.svg#svgView(viewBox(0,0,1280,380))" alt="Agou DSH Plugins">
  </picture>
</p>

<div align="center">

# agou-dsh-plugins

<sup>[English](README.md) | **中文**</sup>

由 [agoudbg](https://github.com/agoudbg) 开发的 DSH（DeepSeek Harness）插件。

</div>

## 插件

<!-- BEGIN AUTO-GENERATED PLUGIN LIST: DO NOT EDIT -->

<img src="packages/dsh-auto-permission-default/icon.svg#svgView(viewBox(6.5,6.5,31.625,28.75))" alt="自动审查默认权限图标" width="22" height="20" align="absmiddle" />**[自动审查默认权限](packages/dsh-auto-permission-default)**<br>
<sub>让每个新建交互会话默认使用“自动审查”权限预设。</sub>

<img src="packages/dsh-hide-context-hints/icon.svg#svgView(viewBox(6,6,33,30))" alt="隐藏上下文提示图标" width="22" height="20" align="absmiddle" />**[隐藏上下文提示](packages/dsh-hide-context-hints)**<br>
<sub>隐藏会话中的“上下文注入”提示。</sub>

<img src="packages/dsh-menu-search/icon.svg#svgView(viewBox(6.4,6.4,30.25,27.5))" alt="菜单搜索图标" width="22" height="20" align="absmiddle" />**[菜单搜索](packages/dsh-menu-search)**<br>
<sub>为工作区、工作模式和分支菜单添加搜索框。</sub>

<img src="packages/dsh-model-effort-memory/icon.svg#svgView(viewBox(7.5,7.5,30.25,27.5))" alt="记住模型推理强度图标" width="22" height="20" align="absmiddle" />**[记住模型推理强度](packages/dsh-model-effort-memory)**<br>
<sub>切换模型时恢复每个模型上次选择的推理强度。</sub>

<img src="packages/dsh-pasted-text-file/icon.svg#svgView(viewBox(7.5,6.5,33,30))" alt="长文本粘贴附件图标" width="22" height="20" align="absmiddle" />**[长文本粘贴附件](packages/dsh-pasted-text-file)**<br>
<sub>将长文本粘贴为附件。</sub>

<img src="packages/dsh-plugin-installed-order/icon.svg#svgView(viewBox(6.8,6,35.0625,31.875))" alt="已安装插件优先图标" width="22" height="20" align="absmiddle" />**[已安装插件优先](packages/dsh-plugin-installed-order)**<br>
<sub>在插件管理的“已安装”页面中，将“已安装插件”排在内置实验性插件前面。</sub>

<img src="packages/dsh-scrollbar-edge-hit/icon.svg#svgView(viewBox(7,7,31.625,28.75))" alt="滚动条贴边可用图标" width="22" height="20" align="absmiddle" />**[滚动条贴边可用](packages/dsh-scrollbar-edge-hit)**<br>
<sub>让滚动条在鼠标位于屏幕边缘时可用。</sub>

<img src="packages/dsh-session-grouping-bell/icon.svg#svgView(viewBox(7,6.5,33.6875,30.625))" alt="会话分组铃铛图标" width="22" height="20" align="absmiddle" />**[会话分组铃铛](packages/dsh-session-grouping-bell)**<br>
<sub>快速切换到单列表视图。</sub>

<img src="packages/dsh-session-workspace-label/icon.svg#svgView(viewBox(7,7.5,29.5625,26.875))" alt="会话工作区标签图标" width="22" height="20" align="absmiddle" />**[会话工作区标签](packages/dsh-session-workspace-label)**<br>
<sub>在单列表模式分组显示工作区名称。</sub>

<img src="packages/dsh-sidebar-scroll-flow/icon.svg#svgView(viewBox(6.5,6.5,32.3125,29.375))" alt="侧边栏整体滚动图标" width="22" height="20" align="absmiddle" />**[侧边栏整体滚动](packages/dsh-sidebar-scroll-flow)**<br>
<sub>为 DSH 0.2.2-rc.3 之前的版本增大侧边栏对话列表的显示区域。在 0.2.2-rc.3 或更高版本中不生效。</sub>

<img src="packages/dsh-worktrees/icon.svg#svgView(viewBox(7.5,7.5,29.5625,26.875))" alt="工作树图标" width="22" height="20" align="absmiddle" />**[工作树](packages/dsh-worktrees)**<br>
<sub>为会话选择 Git 分支或新建本地工作树，支持保存快照后自动清理和恢复。</sub>

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

运行 `pnpm artwork:generate` 重新生成横幅和主图标。CI 会在每次推送到 `main` 时重新生成横幅并提交结果，插件图标变化后横幅不会停留在旧版本。需要比对时，运行 `pnpm artwork:compare --reference <本地参考图路径>`，结果写入 `.tmp/artwork/qa`。重复排列规则和输出文件见[图片生成说明](docs/artwork.md)。

本仓库是一个 pnpm workspace：

```sh
pnpm install
```

每个插件都是自包含的纯 ESM JavaScript，无需构建。编辑 `packages/<name>` 下的文件，然后重新安装 bundle，即可在 DSH profile 中试用改动。

每次推送都会运行 `scripts/check-packages.mjs`。该脚本会检查每个包的清单、导出目标、入口语法和 `npm pack` 文件列表。DSH 插件页不渲染原始 HTML，所以每个包还带有 `DETAIL.md` 和 `DETAIL-zh-CN.md`，由 `node scripts/build-plugin-details.mjs` 从 README 生成；副本过期时检查会失败。

## 发布

发布无需额外命令：将包 `package.json` 中的 `version` 更新推送到 `main` 后，CI 会发布所有版本高于 npm 当前版本的包。随后 CI 会创建 `<package>@<version>` 标签，并根据生成的变更说明创建 GitHub Release。

推送的版本更新就是发布确认。npm 上已经存在的版本会跳过，低于或等于 npm 最新版本的版本会导致运行失败。

修改 `packages/*/package.json` 中 `version` 的拉取请求会被 *PR Version Guard* 检查标记：外部贡献者会因此检查失败，维护者则会收到合并后将发布哪些包的提示。

插件市场索引 `market/index.json` 和两份 README 中的插件区块都由 `scripts/build-market-index.mjs` 根据包清单、本地化文件、图标和 Git 历史生成。生成区块不能手动编辑。CI 会在每次推送时验证这些输出；如果它们发生变化，CI 会生成刷新后的副本并提交回 `main`。每次 npm 发布都会记录在 `market/published.json` 中，该记录会把对应版本的安装来源切换为 npm。

## 许可证

[MIT](LICENSE)
