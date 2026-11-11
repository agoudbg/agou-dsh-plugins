![](icon.svg) **记住模型推理强度**

记住你在每个模型上最后使用的推理强度。切换到其他模型再切回来时，会自动选回上次的强度；如果该模型已不再提供这个强度，则使用它的默认值。

记录按模型分别保存在当前浏览器中，刷新页面后仍然有效。

## 安装

需要 DSH 0.2.1-rc.5 或更高版本，并使用网页界面。

```sh
dsh plugin --profile <profile> add dsh-model-effort-memory
```

也可以克隆 [agou-dsh-plugins](https://github.com/agoudbg/agou-dsh-plugins) 仓库，在插件管理器中通过本包目录的绝对路径安装。

## 许可证

[MIT](./LICENSE)
