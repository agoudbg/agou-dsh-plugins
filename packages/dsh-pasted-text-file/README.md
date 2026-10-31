# dsh-pasted-text-file

Paste long text as an attachment.

Attachments use UTF-8. The filename follows the interface language: `Pasted text.txt` in English or `粘贴的文本.txt` in Chinese. You can keep editing your message and send the attachment with it.

## Install

Requires DSH `>=0.2.1-rc.5` with the Web UI and its standard attachment support.

Install this package directory by its absolute path in the DSH Plugin Manager. After a published release, you can also install it with:

```sh
dsh plugin --profile <profile> add dsh-pasted-text-file
```

## Use

Paste text into the message input. Up to 5000 Unicode code points stay in the input. Longer pastes appear as separate text attachments without changing your existing draft. Chinese characters and a single-code-point emoji each count as one character.

The first generated attachment keeps the base filename. Later pastes in the same conversation use `Pasted text (1).txt`, `Pasted text (2).txt`, and so on. The counter is saved per conversation in this browser and continues after reload. Removing or restoring an attachment does not reuse its number. Language changes apply to newly generated filenames and keep the same counter. Existing filenames remain unchanged. Names already present among draft or clipboard attachments are skipped.

Click **Paste into text box** on a generated attachment to insert its original text at the current selection and remove that attachment. Each attachment has its own link, so you can restore multiple pastes separately. Ordinary files with the same name do not receive this link.

Files and images in the same clipboard operation are attached together with the text file. Upload status, retry, removal, and image previews remain available. If the attachment cannot be added, its text remains available in a recovery card. Restoring text does not trigger another paste conversion.

## Compatibility

This plugin supplies the composer attachment rail and uses the existing DSH file intake and upload operations. A plugin that also replaces this rail may conflict with it. Child-agent conversations keep their normal text-paste behavior because DSH only permits image attachments there.

The restore link belongs to unsent draft attachments. Browser reloads discard these attachments, following DSH's normal draft-attachment behavior. Disabling the plugin returns the standard attachment rail.

## 中文

将长文本粘贴为附件。

在对话输入框粘贴超过 5000 个字符的文本，会生成 UTF-8 附件。文件名跟随界面语言，中文界面生成 `粘贴的文本.txt`，英文界面生成 `Pasted text.txt`。原有草稿保持不变，你可以继续编辑消息，再连同附件一起发送。5000 个字符以内正常粘贴，中文字符和单个码点的表情各计一个字符。

同一对话中的首份附件保留原名，后续依次命名为 `粘贴的文本 (1).txt`、`粘贴的文本 (2).txt`。编号按对话保存在这个浏览器中，刷新页面后继续递增。删除或还原附件不会重用编号。切换界面语言只影响新生成的文件名，编号继续递增，已有文件名保持不变。遇到草稿或剪贴板里已有的同名文件时，会跳过那个名字。

点击附件上的“粘贴到文本框”，原文会插入到输入框的当前选区，这份附件随即移除。连续粘贴的多份文本可以分别还原，普通上传的同名文件没有这个链接。还原操作不会再次触发自动转换。

剪贴板里的普通文件和图片可以随长文本一起添加。附件上传失败后可以重试，也可以直接将生成的文本附件恢复到输入框。如果附件未能添加，恢复卡片会保留这份文本。图片可以查看原图，附件可以单独移除。

这个插件接管输入框的附件展示区域，其他同样替换该区域的插件可能与它冲突。子智能体会话只接受图片附件，所以其中的文本继续正常粘贴。还原链接只出现在尚未发送的草稿附件上。刷新页面会丢弃草稿附件，这和 DSH 原有行为相同。

## Development

Edit `locale/en.json` and `locale/zh.json` to change localized text. They supply both the Plugin Manager metadata and the runtime dictionaries. `client.locales.js` is generated; do not edit it by hand.

From this package directory, run `pnpm run build` after changing locales for a local directory installation. Packing or publishing runs the generator automatically through `prepack`. Run `node scripts/build-locales.mjs --check` to detect stale output and `pnpm test` for the locale-generation regression tests.

## License

MIT
