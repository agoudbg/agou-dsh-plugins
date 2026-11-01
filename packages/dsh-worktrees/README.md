# dsh-worktrees

Choose **Local** or **New local worktree** beside the workspace and mode menus when you start a conversation. You can work on an isolated checkout while keeping the conversation in its original workspace group.

## Install

Requires DSH **0.2.1-rc.5** with the Web UI and Git for worktree operations. Install this package directory by its absolute path in the DSH Plugin Manager.

The plugin targets this DSH version's conversation and sidebar interfaces. Other DSH versions require verification before the supported version range is expanded.

## Choose where to work

With **Local** selected, the branch menu shows the source workspace's actual branch. Choosing another local branch checks it out immediately. Git errors appear in a dialog, and the plugin does not stash or discard your changes to make checkout succeed.

With **New local worktree** selected, the branch menu chooses the starting branch. The directory is created when you send the first message, using that branch's committed revision. Changes that you have not committed in the source checkout are not copied. Choosing a mode or base branch does not allocate a directory or switch the source branch.

A new worktree starts with detached HEAD. The model receives its path and base revision, together with a reminder to create a task branch before authorized code changes if HEAD is still detached. It is not asked to create a branch for a read-only task, or to commit or push automatically.

Your last successfully sent choice is remembered separately for each workspace. Unsent changes and failed sends do not replace that choice. Local mode always reads the actual branch; returning to a workspace never automatically checks out a remembered local branch.

If preparation fails, an error dialog explains why and your draft and attachments remain available. Retrying reuses a successfully prepared checkout. Follow-up messages use the same worktree. Conversations that already existed when the plugin was installed keep their current directory. Local conversations retain directory changes made with native tools. If a working subdirectory inside a managed checkout disappears, the conversation returns to that checkout's root.

## Manage worktrees

Open **Settings → Worktrees**.

- **Worktree directory** defaults to the `worktrees` directory under the DSH data directory. A change applies to future worktrees. Existing worktrees remain at their recorded paths.
- **Maximum retained worktrees** defaults to **15**, with a minimum of **1**. This is a background cleanup target for eligible worktrees across the current profile. Pinned conversations and active work are protected and excluded from the target, so the total can exceed it.
- **Managed worktrees** groups checkouts by source repository. You can refresh their status, open linked conversations, restore a saved checkout, or delete a checkout after confirmation.

Reaching the retention target never prevents a new worktree and does not display a cleanup prompt. Cleanup happens in the background after creation and other relevant activity. Abandoned checkouts without an accepted conversation receive a one-hour grace period. Among eligible entries, abandoned checkouts are considered first, then those whose linked conversations have been inactive longest.

Deleting a worktree manually saves a snapshot first and archives its linked conversations after removal. A pinned or active worktree cannot be deleted. If a safe snapshot cannot be saved, the directory is kept and its error is available in settings. Branches and recovery snapshots are not deleted.

## Restore a cleaned-up checkout

Automatic cleanup removes the checkout directory after saving a Git snapshot in the original repository. The conversation remains in the sidebar. Opening it to read history does not recreate files.

When you send another message, choose **Restore** in the confirmation dialog to recreate the checkout before that message is sent. You can also restore it from **Settings → Worktrees**. Cancelling preserves the draft. An occupied original path is not overwritten. If the directory disappeared without a usable snapshot, an error is shown rather than continuing in the source directory.

Snapshots preserve local commit ancestry, tracked file contents and untracked files that Git does not ignore. **Ignored files are not backed up, and staged versus unstaged changes are not preserved.** Restored changes are the contents of a detached snapshot commit. Snapshots have no automatic expiry, so their objects remain in the original repository.

Initialized submodules, embedded repositories and files that cannot be snapshotted safely cause cleanup to keep the checkout. A failed cleanup may leave more than the retention target on disk.

## Find worktree conversations

Worktree conversations have a branch icon in the sidebar. Hover over a conversation to view its path, current branch and known starting branch. In **In one list** view, an extra line shows the worktree information. If Session workspace labels is enabled, its workspace-name line is retained as well.

Existing linked Git worktrees also receive sidebar annotations. They remain outside this plugin's managed inventory and automatic cleanup.

The native running, unread, scheduling and pin indicators remain available. A cleaned-up checkout keeps its conversation and is labelled **Cleaned up**.

## Permissions and tools

The plugin preserves the session's existing permission mode. Creating a checkout outside the original workspace does not make it writable under workspace-write confinement. Those writes use DSH's existing approval mechanisms; full-access sessions retain their existing access.

`worktree_info` reads status, managed-worktree lists and branches. `worktree_manage` exposes the same preparation, checkout, restore, removal and configuration operations as the interface. Mutating tool calls use DSH's approval flow; the model cannot approve its own request. Preparation does not send a chat message, and a new worktree selection is limited to a blank session.

Disabling the plugin removes its menus, settings page, annotations and send adapter. It keeps existing checkouts, Git snapshots and stored choices. Restore any cleaned-up checkout before continuing its conversation without the plugin's directory guard.

## 中文

在新会话的工作区、模式菜单右侧选择“本地”或“新建本地工作树”。本地模式的分支选择会立即切换原工作区分支，新建模式只选择创建来源，发送第一条消息时才创建工作树。

每个工作区分别记住上一次成功发送时的选择。新工作树采用 detached HEAD，模型会得到创建任务分支的提醒。创建失败时，错误通过对话框显示，草稿和附件保持可重试。

在“设置 → 工作树”中修改新建目录和保留数量，查看、恢复或删除工作树。默认保留 15 个符合清理条件的工作树，置顶和运行中的会话受到保护。数量超过目标不会阻止新建，也不会主动要求清理。

自动清理先保存 Git 快照，再删除目录，历史会话仍然保留。继续发送前需要确认恢复。快照不包含被 Git 忽略的文件，不保留暂存与未暂存的区分，恢复后的文件修改位于一个 detached 的快照提交中。

插件保持原有权限。工作树位于原工作区之外时，受限权限下的写入继续使用 DSH 原有审批。

## License

MIT. The package icon uses Lucide GitBranch under the ISC license; both notices are included in LICENSE.
