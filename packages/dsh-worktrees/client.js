window.__ModuleLoader__.load({
  id: 'dsh-worktrees',
  factory(require) {
    const React = require('react');
    const { Button, Menu, Modal, IconFollowsystemOutlineRegular, IconBranchOutlineRegular, IconChevronDownOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement;
    const NS = 'worktrees';
    const PREFIX = 'dsh-worktrees';
    const ACTION_SLOT = 'sidebar.workspaces.session.row.action';
    const MARKER = `${PREFIX}-marker`;
    const ROW = `[data-row-key^="session:"]:has(.${MARKER})`;
    const FLAT_ROW = `[class*="_flatList"] ${ROW}`;
    const TRANSITIONAL = new Set(['creating', 'snapshotting', 'removing', 'restoring']);
    const CLEANED = new Set(['removed', 'missing']);
    const EMPTY_ARRAY = Object.freeze([]);

    // Trigger geometry follows AgentPresetSeat and HeroShell in DSH 0.2.1-rc.5.
    // Native Menu and Modal own keyboard navigation, focus return and dismissal.
    const CSS = `
[class$="_heroOptions"]:has(> [data-slot="conversation.hero.options"] .${PREFIX}-seat) { margin-left: 0; }
.${PREFIX}-anchor { min-width: 54px; max-width: 100%; }
.${PREFIX}-seat {
  border-radius: var(--dsw-radius-sm); min-width: 0; max-width: min(100%,240px);
  min-height: 28px; color: var(--dsw-alias-label-primary); white-space: nowrap;
  cursor: pointer; background: transparent; border: none; align-items: center;
  gap: 4px; padding: 0 8px; font-size: 13px; font-weight: 500; line-height: 20px;
  display: inline-flex;
}
.${PREFIX}-seat:not(:disabled):hover, .${PREFIX}-seat[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); }
.${PREFIX}-seat:disabled { cursor: default; color: var(--dsw-alias-label-quaternary); }
.${PREFIX}-seat:focus-visible, .${PREFIX}-input:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary)); outline-offset: -2px;
}
.${PREFIX}-seatLabel { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${PREFIX}-seatIcon { flex: none; }
.${PREFIX}-chevron { color: var(--dsw-alias-label-caption); flex: none; }
.${PREFIX}-section { min-width: 0; color: var(--dsw-alias-label-primary); }
.${PREFIX}-setting { border-bottom: .5px solid var(--dsw-alias-border-l2); display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 16px 0; }
.${PREFIX}-settingLabel { min-width: 0; flex: 1; }
.${PREFIX}-title { font-size: 14px; line-height: 20px; }
.${PREFIX}-help { color: var(--dsw-alias-label-secondary); margin-top: 4px; font-size: 12px; line-height: 18px; }
.${PREFIX}-field { display: flex; align-items: center; gap: 8px; min-width: 0; width: min(52%,360px); }
.${PREFIX}-field > button { flex-shrink: 0; white-space: nowrap; }
.${PREFIX}-input { box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-primary); min-width: 0; width: 100%; padding: 6px 8px; font: inherit; font-size: 13px; line-height: 20px; }
.${PREFIX}-number { width: 76px; flex: none; }
.${PREFIX}-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 24px 0 8px; }
.${PREFIX}-repo { margin: 24px 0 0; font-size: 14px; line-height: 20px; font-weight: 500; overflow-wrap: anywhere; }
.${PREFIX}-record { border-bottom: .5px solid var(--dsw-alias-border-l2); padding: 16px 0; }
.${PREFIX}-recordHead { display: flex; align-items: baseline; gap: 8px; }
.${PREFIX}-recordTitle { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 20px; }
.${PREFIX}-status { flex: none; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.${PREFIX}-path { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; font-size: 12px; line-height: 18px; margin-top: 4px; }
.${PREFIX}-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.${PREFIX}-error { color: var(--dsw-alias-state-error-primary); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 18px; margin-top: 8px; }
.${PREFIX}-rawError { margin: 0; max-height: 50vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--ds-font-family-code); font-size: 12px; line-height: 18px; }
.${PREFIX}-modalAction { min-width: 72px; }
.${PREFIX}-dialogText { white-space: pre-wrap; overflow-wrap: anywhere; }
/* Match the native hover path/time foreground on the dark card. */
.${PREFIX}-hover { color: #cfd3d6; font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.${PREFIX}-hoverLine + .${PREFIX}-hoverLine { margin-top: 4px; }
.${MARKER} { color: var(--dsw-alias-label-tertiary); flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 20px; pointer-events: none; }
.${PREFIX}-rowIcon { flex: none; }
.${PREFIX}-rowInfo { display: none; }
${ROW} > [class*="_rowActions"] { display: inline-flex; }
${ROW}:not(:hover):not([class*="_menuOpen"]) > [class*="_rowActions"] > :not([data-slot="${ACTION_SLOT}"]),
${ROW}:not(:hover):not([class*="_menuOpen"]) > [class*="_rowActions"] > [data-slot="${ACTION_SLOT}"] > :not(.${MARKER}):not(.dsh-session-workspace-label) { display: none; }
${FLAT_ROW} { position: relative; box-sizing: border-box; height: 48px; padding-top: 4px; padding-bottom: 24px; }
${FLAT_ROW} .${MARKER} { position: absolute; inset-inline: 28px 8px; bottom: 4px; width: auto; height: 17px; justify-content: flex-start; gap: 4px; min-width: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 17px; font-weight: 400; }
${FLAT_ROW} .${PREFIX}-rowInfo { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${FLAT_ROW}:has(.dsh-session-workspace-label) { height: 65px; padding-bottom: 41px; }
${FLAT_ROW} .dsh-session-workspace-label { bottom: 21px; }
/* The workspace-label plugin hides other action children at rest. Override only our marker. */
${FLAT_ROW}:not(:hover):not([class*="_menuOpen"]) > [class*="_rowActions"] > [data-slot="${ACTION_SLOT}"] > .${MARKER}.${MARKER} { display: inline-flex; }
@media (max-width: 600px) {
  .${PREFIX}-setting { align-items: stretch; flex-direction: column; gap: 12px; }
  .${PREFIX}-field { width: 100%; }
}
`;

    // BEGIN GENERATED COPY: edit locale/*.json, then run pnpm locales.
    const COPY = {
      "en": {
        "nav": "Worktrees",
        "worktree": "Worktree",
        "branch": "Branch",
        "local": "Local",
        "new": "New local worktree",
        "loading": "Loading…",
        "detached": "Detached HEAD",
        "noGit": "This workspace is not a Git repository.",
        "noBranches": "No branches are available.",
        "noCommit": "Create a commit in this repository before creating a worktree.",
        "gitUnavailable": "Git is unavailable. Local sessions can still use this workspace.",
        "locked": "This session will continue in its prepared directory.",
        "snapshotHelp": "Git-ignored files are not included. Restored changes are recorded in a snapshot commit.",
        "localHint": "Use the source directory. Choosing a branch checks it out immediately.",
        "newHint": "Create a local worktree when the first message is sent.",
        "baseHint": "Choose the base branch for the new worktree.",
        "directory": "Worktree directory",
        "directoryHelp": "Applies to newly created worktrees. Existing worktrees keep their paths.",
        "chooseDirectory": "Choose folder",
        "maxRetained": "Maximum retained worktrees",
        "retentionHelp": "Eligible worktrees above this limit are snapshotted before cleanup. Pinned sessions and active work are protected, so the total can exceed the limit.",
        "invalidMaximum": "Enter a whole number of at least 1.",
        "directoryRequired": "Enter a worktree directory.",
        "managed": "Managed worktrees",
        "refresh": "Refresh",
        "empty": "No managed worktrees.",
        "untitled": "Untitled session",
        "openSessions": "Open session",
        "archived": "Archived",
        "basedOn": "Based on {branch}",
        "rowWorktree": "Worktree",
        "hoverPath": "Worktree path: {path}",
        "hoverBranch": "Worktree branch: {branch}",
        "ready": "Ready",
        "active": "Active",
        "pinned": "Pinned",
        "protected": "Protected",
        "creating": "Creating",
        "snapshotting": "Saving snapshot",
        "removing": "Cleaning up",
        "removed": "Cleaned up",
        "missing": "Directory missing",
        "restoring": "Restoring",
        "error": "Error",
        "restore": "Restore",
        "delete": "Delete",
        "cancel": "Cancel",
        "close": "Close",
        "restoreTitle": "Restore worktree?",
        "restoreBody": "This worktree has been cleaned up. Restore its saved snapshot to continue in a detached worktree.",
        "deleteTitle": "Delete worktree?",
        "deleteBody": "This removes the worktree directory and archives its associated chats. A saved snapshot remains available for restoration.",
        "deleteProtected": "Active worktrees and worktrees with pinned sessions cannot be deleted.",
        "actionError": "Worktree operation failed",
        "checkoutError": "Could not switch branch",
        "archivedHelp": "Unarchive this session in the sidebar to open it.",
        "invalidResponse": "The worktree service returned an invalid response.",
        "notReady": "The worktree is not ready. Refresh and try again.",
        "adapterUnavailable": "This DSH version does not expose the supported conversation send method."
      },
      "zh": {
        "nav": "工作树",
        "worktree": "工作树",
        "branch": "分支",
        "local": "本地",
        "new": "新建本地工作树",
        "loading": "正在加载…",
        "detached": "分离的 HEAD",
        "noGit": "此工作区不是 Git 仓库。",
        "noBranches": "没有可用的分支。",
        "noCommit": "请先在仓库中创建提交，再新建工作树。",
        "gitUnavailable": "Git 不可用，此工作区仍可用于本地会话。",
        "locked": "此会话将在已经准备好的目录中继续。",
        "snapshotHelp": "快照不包含被 Git 忽略的文件。恢复后的修改会记录为一次快照提交。",
        "localHint": "使用源目录。选择分支会立即切换源目录的分支。",
        "newHint": "发送第一条消息时创建本地工作树。",
        "baseHint": "选择新工作树的基础分支。",
        "directory": "工作树目录",
        "directoryHelp": "仅影响新建的工作树，现有工作树的路径保持不变。",
        "chooseDirectory": "选择文件夹",
        "maxRetained": "最多保留工作树数量",
        "retentionHelp": "超过此数量的可清理工作树会先保存快照，再清理目录。置顶会话和正在运行的工作树受到保护，因此总数可能超过此限制。",
        "invalidMaximum": "请输入不小于 1 的整数。",
        "directoryRequired": "请输入工作树目录。",
        "managed": "管理工作树",
        "refresh": "刷新",
        "empty": "暂无托管工作树。",
        "untitled": "未命名会话",
        "openSessions": "打开会话",
        "archived": "已归档",
        "basedOn": "基于 {branch}",
        "rowWorktree": "工作树",
        "hoverPath": "工作树路径：{path}",
        "hoverBranch": "工作树分支：{branch}",
        "ready": "就绪",
        "active": "运行中",
        "pinned": "已置顶",
        "protected": "受到保护",
        "creating": "正在创建",
        "snapshotting": "正在保存快照",
        "removing": "正在清理",
        "removed": "已清理",
        "missing": "目录缺失",
        "restoring": "正在恢复",
        "error": "错误",
        "restore": "恢复",
        "delete": "删除",
        "cancel": "取消",
        "close": "关闭",
        "restoreTitle": "恢复工作树？",
        "restoreBody": "此工作树已经清理。恢复保存的快照后，将在分离的工作树中继续工作。",
        "deleteTitle": "删除工作树？",
        "deleteBody": "这会删除工作树目录，并归档关联会话。保存的快照仍可用于恢复。",
        "deleteProtected": "正在运行的工作树和包含置顶会话的工作树不能删除。",
        "actionError": "工作树操作失败",
        "checkoutError": "无法切换分支",
        "archivedHelp": "请先在侧边栏取消归档，再打开此会话。",
        "invalidResponse": "工作树服务返回了无效结果。",
        "notReady": "工作树尚未就绪，请刷新后重试。",
        "adapterUnavailable": "此 DSH 版本没有提供受支持的会话发送方法。"
      }
    };
    // END GENERATED COPY

    function createStore(initial) {
      let snapshot = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        set(next) {
          if (Object.is(next, snapshot)) return;
          snapshot = next;
          for (const listener of listeners) listener();
        },
      };
    }
    function useStore(store) {
      return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    }
    function useSelected(store, selector) {
      const get = React.useCallback(() => selector(store.getSnapshot()), [store, selector]);
      return React.useSyncExternalStore(store.subscribe, get, get);
    }
    function branchLabel(ref) {
      return typeof ref === 'string' ? ref.replace(/^refs\/(heads|remotes)\//, '') : '';
    }
    function baseFor(info, preference) {
      const ref = preference?.baseRef;
      return ref && (ref === 'HEAD' || info?.branches.some((branch) => branch.ref === ref)) ? ref : info?.defaultBase;
    }
    function basename(path) {
      return path?.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path || '';
    }
    function messageOf(error) { return error instanceof Error ? error.message : String(error); }
    function aborted(error) { return error instanceof Error && error.name === 'AbortError'; }
    function workspaceOf(items, sessionId) {
      return items.find((workspace) => workspace.sessionIds.includes(sessionId));
    }

    function createController(ctx) {
      const t = ctx.locale.bind(NS);
      const rpc = ctx.get('connection').rpc;
      const lifetime = new AbortController();
      const requests = new Set();
      const workspaces = new Map();
      const choices = new Map();
      const pendingOperations = new Set();
      const prepared = new Set();
      const reportedErrors = new WeakSet();
      const dialogs = [];
      const dialog = createStore(null);
      const data = createStore({
        phase: 'idle', error: null, records: EMPTY_ARRAY, bindings: EMPTY_ARRAY,
        preferences: EMPTY_ARRAY, config: null, revision: undefined,
        recordById: new Map(), bindingBySession: new Map(), observedBySession: new Map(), preferenceByWorkspace: new Map(),
        directoryPickerKind: null,
      });
      const drafts = createStore(0);
      let listPending;
      let refreshAgain = false;
      let listEpoch = 0;

      async function call(endpoint, payload, signal) {
        const request = new AbortController();
        const abort = () => request.abort();
        if (lifetime.signal.aborted || signal?.aborted) request.abort();
        lifetime.signal.addEventListener('abort', abort, { once: true });
        signal?.addEventListener('abort', abort, { once: true });
        requests.add(request);
        try {
          const result = await ctx.get('connection').rpc.call('/api', `dsh-worktrees/${endpoint}`, payload, request.signal);
          if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (!result || typeof result.ok !== 'boolean') throw new Error(t('invalidResponse'));
          if (!result.ok) {
            const error = new Error(result.error?.message || t('invalidResponse'));
            error.code = result.error?.code;
            error.details = result.error?.details;
            throw error;
          }
          return result.value;
        } finally {
          requests.delete(request);
          lifetime.signal.removeEventListener('abort', abort);
          signal?.removeEventListener('abort', abort);
        }
      }

      function refresh(force = false) {
        if (lifetime.signal.aborted) return Promise.resolve(false);
        if (listPending) {
          if (force) { refreshAgain = true; listEpoch += 1; }
          return listPending;
        }
        const epoch = ++listEpoch;
        data.set({ ...data.getSnapshot(), phase: 'loading', error: null });
        listPending = call('list', { refresh: force }).then((value) => {
          if (!value || !Array.isArray(value.records) || !Array.isArray(value.bindings)
            || (value.observed !== undefined && !Array.isArray(value.observed))
            || !Array.isArray(value.preferences) || typeof value.config?.directory !== 'string'
            || !Number.isInteger(value.config.maxRetained) || value.config.maxRetained < 1
            || !Number.isSafeInteger(value.revision)) throw new Error(t('invalidResponse'));
          if (lifetime.signal.aborted || epoch !== listEpoch) return false;
          data.set({
            ...value, phase: 'ready', error: null,
            recordById: new Map(value.records.map((record) => [record.id, record])),
            bindingBySession: new Map(value.bindings.map((binding) => [binding.sessionId, binding])),
            observedBySession: new Map((value.observed ?? EMPTY_ARRAY).flatMap(record => record.sessionIds.map(id => [id, record]))),
            preferenceByWorkspace: new Map(value.preferences.map((preference) => [preference.workspaceId, preference])),
          });
          return true;
        }).catch((error) => {
          if (!lifetime.signal.aborted && epoch === listEpoch && !aborted(error)) {
            data.set({ ...data.getSnapshot(), phase: 'error', error: messageOf(error) });
          }
          return false;
        }).finally(() => {
          listPending = undefined;
          if (refreshAgain && !lifetime.signal.aborted) { refreshAgain = false; return refresh(true); }
        });
        return listPending;
      }

      function workspaceState(workspaceId) {
        let entry = workspaces.get(workspaceId);
        if (!entry) {
          entry = {
            store: createStore({ phase: 'idle', info: null, error: null, busy: false }),
            request: null, pending: null, checkout: null, seq: 0,
          };
          workspaces.set(workspaceId, entry);
        }
        return entry;
      }
      function loadWorkspace(workspaceId, force = false) {
        const entry = workspaceState(workspaceId);
        if (!force && entry.pending) return entry.pending;
        if (!force && entry.store.getSnapshot().phase === 'ready') return Promise.resolve();
        entry.request?.abort();
        const request = new AbortController();
        const seq = ++entry.seq;
        entry.request = request;
        entry.store.set({ ...entry.store.getSnapshot(), phase: 'loading', error: null });
        entry.pending = call('workspace', { workspaceId }, request.signal).then((info) => {
          if (!info || info.workspaceId !== workspaceId || typeof info.isGit !== 'boolean'
            || !Array.isArray(info.branches)) throw new Error(t('invalidResponse'));
          if (seq === entry.seq) entry.store.set({ ...entry.store.getSnapshot(), phase: 'ready', info, error: null });
        }).catch((error) => {
          if (!lifetime.signal.aborted && seq === entry.seq && !aborted(error)) {
            entry.store.set({ ...entry.store.getSnapshot(), phase: 'error', error: messageOf(error) });
          }
        }).finally(() => { if (seq === entry.seq) entry.pending = null; });
        return entry.pending;
      }
      function choose(sessionId, choice) {
        choices.set(sessionId, choice);
        drafts.set(drafts.getSnapshot() + 1);
      }
      function choiceFor(sessionId, workspaceId, info) {
        const state = data.getSnapshot();
        const binding = state.bindingBySession.get(sessionId);
        if (binding) return binding;
        const draft = choices.get(sessionId);
        if (draft) return draft;
        const saved = state.preferenceByWorkspace.get(workspaceId) ?? info?.choice;
        if (info?.isGit && saved?.mode === 'new') return { mode: 'new', baseRef: baseFor(info, saved) };
        return { mode: 'local' };
      }
      function settleDialog(item, accepted) {
        const index = dialogs.indexOf(item);
        if (index < 0) return;
        dialogs.splice(index, 1);
        item.cleanup?.();
        item.resolve?.(accepted);
        dialog.set(dialogs[0] ?? null);
      }
      function confirm(kind, path, signal) {
        if (lifetime.signal.aborted || signal?.aborted) return Promise.resolve(false);
        return new Promise((resolve) => {
          const item = { kind, path, resolve };
          const cancel = () => settleDialog(item, false);
          item.cleanup = () => signal?.removeEventListener('abort', cancel);
          signal?.addEventListener('abort', cancel, { once: true });
          dialogs.push(item);
          dialog.set(dialogs[0]);
        });
      }
      function report(error, title = 'actionError') {
        if (lifetime.signal.aborted || aborted(error)) return;
        if (error instanceof Error) {
          if (reportedErrors.has(error)) return;
          reportedErrors.add(error);
        }
        dialogs.push({ kind: 'error', title, message: messageOf(error) });
        dialog.set(dialogs[0]);
      }
      function checkout(workspaceId, branch) {
        const entry = workspaceState(workspaceId);
        if (entry.checkout) return entry.checkout;
        entry.store.set({ ...entry.store.getSnapshot(), busy: true });
        entry.checkout = call('checkout', { workspaceId, branch }).then(() => loadWorkspace(workspaceId, true))
          .finally(() => {
            entry.checkout = null;
            entry.store.set({ ...entry.store.getSnapshot(), busy: false });
          });
        return entry.checkout;
      }
      async function prepare(session, operationId, signal) {
        const sessionId = session.sessionId;
        const workspace = workspaceOf(ctx.get('workspaces').list.getSnapshot().items, sessionId);
        if (!workspace && data.getSnapshot().phase !== 'ready') {
          await refresh();
          if (data.getSnapshot().phase !== 'ready') throw new Error(data.getSnapshot().error || t('notReady'));
        }
        if (!workspace && !data.getSnapshot().bindingBySession.has(sessionId) && !prepared.has(sessionId)) return;
        if (workspace) await workspaceState(workspace.workspaceId).checkout;
        if (signal?.aborted || lifetime.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const binding = data.getSnapshot().bindingBySession.get(sessionId);
        const choice = binding || prepared.has(sessionId) ? undefined : choices.get(sessionId);
        const payload = { sessionId, operationId, ...(choice ? { choice } : {}) };
        pendingOperations.add(operationId);
        let result = await call('prepare', payload, signal);
        if (result?.requiresRestore === true) {
          const record = data.getSnapshot().recordById.get(result.worktreeId);
          if (!await confirm('restore', result.path ?? record?.path, signal)) return false;
          await call('restore', { worktreeId: result.worktreeId }, signal);
          result = await call('prepare', payload, signal);
        }
        if (result?.ready !== true || typeof result.actualDirectory !== 'string' || result.actualDirectory === '') {
          throw new Error(t('notReady'));
        }
        prepared.add(sessionId);
        void refresh(true);
        return true;
      }
      async function settle(sessionId, operationId) {
        if (!pendingOperations.delete(operationId)) return;
        try {
          // Native admission can outlive Client plugin disposal. Its reservation is
          // released afterwards through the captured connection, not an aborted UI request.
          const result = await rpc.call('/api', 'dsh-worktrees/settle', { sessionId, operationId });
          if (!result?.ok) throw new Error(result?.error?.message || t('invalidResponse'));
        }
        catch (error) {
          // A cleanup failure must never turn an admitted message into a failed send.
          if (!aborted(error)) console.warn(`[${PREFIX}] Could not release send preparation:`, error);
          void refresh(true);
        }
      }
      async function recordAction(action, record) {
        if (!await confirm(action, record.path)) return;
        try { await call(action === 'delete' ? 'remove' : 'restore', { worktreeId: record.id }); }
        catch (error) { report(error); }
        finally { await refresh(true); }
      }
      function reset() {
        for (const entry of workspaces.values()) {
          entry.seq += 1;
          entry.request?.abort();
          entry.pending = null;
          entry.store.set({ ...entry.store.getSnapshot(), phase: 'idle' });
        }
        listEpoch += 1;
        void refresh(true);
      }
      return {
        data, drafts, dialog, lifetime, refresh, call, workspaceState, loadWorkspace,
        choiceFor, choose, checkout, prepare, settle, report, confirm, settleDialog, recordAction, reset,
        accepted(sessionId) {
          choices.delete(sessionId);
          drafts.set(drafts.getSnapshot() + 1);
          void refresh(true);
        },
        dispose() {
          lifetime.abort();
          for (const request of requests) request.abort();
          for (const entry of workspaces.values()) entry.request?.abort();
          for (const item of [...dialogs]) settleDialog(item, false);
          choices.clear();
          prepared.clear();
        },
      };
    }

    function installSendGate(ctx, controller) {
      const service = ctx.get('conversation');
      const own = Object.getOwnPropertyDescriptor(service, 'sendSession');
      let owner = service;
      let descriptor;
      while (owner && !descriptor) {
        descriptor = Object.getOwnPropertyDescriptor(owner, 'sendSession');
        owner = Object.getPrototypeOf(owner);
      }
      const original = descriptor?.value;
      if (typeof original !== 'function') {
        controller.report(new Error(ctx.locale.bind(NS)('adapterUnavailable')));
        return () => {};
      }
      let active = true;
      // Cordis traces service method reads. Capture the raw descriptor method and
      // define an instance property so callers keep their traced `this` context.
      async function sendSession(session, text, attachmentIds, mode, signal) {
        if (!active) return original.call(this, session, text, attachmentIds, mode, signal);
        const operationId = globalThis.crypto.randomUUID();
        try {
          try {
            if (await controller.prepare(session, operationId, signal) === false) return { kind: 'error' };
            if (!active || signal?.aborted) return { kind: 'error' };
          } catch (error) {
            controller.report(error);
            // No text: native input restores the draft and attachments without a notice.
            return { kind: 'error' };
          }
          const result = await original.call(this, session, text, attachmentIds, mode, signal);
          if (active && result.kind === 'success') controller.accepted(session.sessionId);
          return result;
        } finally { await controller.settle(session.sessionId, operationId); }
      }
      Object.defineProperty(service, 'sendSession', { configurable: true, writable: true, value: sendSession });
      return () => {
        active = false;
        // Later wrappers may still call ours: leave their property and bypass our gate.
        if (Object.getOwnPropertyDescriptor(service, 'sendSession')?.value !== sendSession) return;
        if (own) Object.defineProperty(service, 'sendSession', own);
        else delete service.sendSession;
      };
    }

    // DSH 0.2.1-rc.5's native header reads the immutable session header cwd.
    // Delegate the native cell with a selector-local view of the live directory.
    function installOpenInAdapter(ctx) {
      const name = 'conversation.session.header.utilities';
      return ctx.slots.inject(name, () => {
        let active = true;
        let original;
        let component;
        let remove;
        let warned = false;
        const clear = () => {
          remove?.();
          remove = undefined;
          original = undefined;
          component = undefined;
        };
        const sync = () => {
          if (!active) return;
          const entries = ctx.slots.entries(name).filter((entry) =>
            entry.options.id === 'open-in-app' && entry.component !== component);
          const native = entries.length === 1 && entries[0].locale === 'open-in-app'
            && (entries[0].options.priority ?? 0) === 0 ? entries[0] : undefined;
          if (!native) {
            clear();
            if (entries.length > 0 && !warned) {
              console.warn(`[${PREFIX}] The native Open-in-app cell is overridden; leaving that action to its owner.`);
              warned = true;
            }
            return;
          }
          warned = false;
          if (original === native) return;
          clear();
          original = native;
          component = function SessionDirectoryOpenIn(props) {
            const { sessionId, useSessions, useProjection } = props;
            const directory = useProjection('workingDirectory');
            // Unknown projections must never briefly open the source checkout.
            const cwd = typeof directory === 'string' && directory.length > 0 ? directory : undefined;
            const useDirectorySessions = React.useCallback((select, equals) => useSessions((state) => {
              const row = state.byId[sessionId];
              if (!row || row.cwd === cwd) return select(state);
              return select({ ...state, byId: { ...state.byId, [sessionId]: { ...row, cwd } } });
            }, equals), [sessionId, useSessions, cwd]);
            return h(native.component, { ...props, useSessions: useDirectorySessions });
          };
          remove = ctx.slots.register({
            // SlotCore elects the lowest priority; the native cell is at zero.
            name, id: 'open-in-app', order: native.options.order, priority: -1,
            locale: native.locale, inject: native.inject,
          }, component);
        };
        const unsubscribe = ctx.slots.subscribe(name, sync);
        sync();
        return () => { active = false; unsubscribe(); clear(); };
      });
    }

    function NativeSelector({ icon: Icon = IconBranchOutlineRegular, label, title, disabled, items, selectedId, onSelect, open, setOpen, ariaLabel }) {
      return h(Menu, {
        open: open && !disabled, onClose: () => setOpen(false), items, selectedId,
        onSelect: (id) => { setOpen(false); onSelect(id); }, align: 'start', portal: true,
        className: `${PREFIX}-anchor`,
        anchor: h('button', {
          type: 'button', className: `${PREFIX}-seat`, disabled, title: title ? `${label}\n${title}` : label,
          'aria-label': `${ariaLabel}: ${label}`, 'aria-haspopup': 'menu', 'aria-expanded': open && !disabled,
          onClick: () => setOpen(!open),
          onKeyDown: (event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
          },
        }, h(Icon, { size: 16, className: `${PREFIX}-seatIcon` }),
        h('span', { className: `${PREFIX}-seatLabel` }, label),
        h(IconChevronDownOutlineRegular, { size: 12, className: `${PREFIX}-chevron` })),
      });
    }

    function WorktreeOptions(props) {
      const { sessionId, useWorkspaces } = props;
      const workspaceId = useWorkspaces((state) => workspaceOf(state.items, sessionId)?.workspaceId);
      if (!workspaceId) return null;
      return h(WorkspaceOptions, { ...props, workspaceId, key: `${sessionId}:${workspaceId}` });
    }

    function WorkspaceOptions({ sessionId, workspaceId, useSessionRetainInfo, controller, t }) {
      const main = useSessionRetainInfo((info) => (info?.retainedBy.mainView ?? 0) > 0);
      const entry = controller.workspaceState(workspaceId);
      const state = useStore(entry.store);
      useStore(controller.drafts);
      const binding = useSelected(controller.data, React.useCallback((snapshot) => snapshot.bindingBySession.get(sessionId), [sessionId]));
      useSelected(controller.data, React.useCallback((snapshot) => snapshot.preferenceByWorkspace.get(workspaceId), [workspaceId]));
      const [worktreeOpen, setWorktreeOpen] = React.useState(false);
      const [branchOpen, setBranchOpen] = React.useState(false);
      React.useEffect(() => {
        if (!main) return;
        void controller.loadWorkspace(workspaceId, true);
        return () => {
          entry.seq += 1;
          entry.request?.abort();
          entry.pending = null;
          entry.store.set({ ...entry.store.getSnapshot(), phase: 'idle' });
        };
      }, [controller, workspaceId, entry, main]);
      React.useEffect(() => {
        if (main && state.phase === 'idle') void controller.loadWorkspace(workspaceId);
      }, [controller, workspaceId, state.phase, main]);
      if (!main) return null;
      const info = state.info;
      const choice = controller.choiceFor(sessionId, workspaceId, info);
      const loading = state.phase === 'idle' || state.phase === 'loading';
      const unavailable = state.error || (info?.reason === 'git-unavailable' ? t('gitUnavailable')
        : !info?.isGit ? t('noGit') : info.reason === 'unborn-head' ? t('noCommit') : null);
      const branches = (info?.branches ?? EMPTY_ARRAY).filter((branch) => choice.mode === 'new' || !branch.remote);
      const base = choice.baseRef || info?.defaultBase;
      const branch = choice.mode === 'new' ? branchLabel(base)
        : info?.currentBranch || (info?.isGit ? `${t('detached')} ${info.head?.slice(0, 7) ?? ''}`.trim() : t('branch'));
      const selectedBranch = choice.mode === 'new' ? base
        : branches.find((item) => item.name === info?.currentBranch)?.ref;
      const setMode = (mode) => {
        setBranchOpen(false);
        if (mode === 'local') controller.choose(sessionId, { mode: 'local' });
        else {
          const saved = controller.data.getSnapshot().preferenceByWorkspace.get(workspaceId) ?? info?.choice;
          controller.choose(sessionId, { mode: 'new', baseRef: baseFor(info, saved) });
        }
      };
      return h(React.Fragment, null,
        h(NativeSelector, {
          icon: choice.mode === 'new' ? IconBranchOutlineRegular : IconFollowsystemOutlineRegular,
          label: choice.mode === 'new' ? t('new') : t('local'), ariaLabel: t('worktree'),
          title: binding ? t('locked') : unavailable || t(choice.mode === 'new' ? 'newHint' : 'localHint'),
          disabled: loading || state.busy || !!unavailable || !!binding, open: worktreeOpen,
          setOpen: (value) => { setBranchOpen(false); setWorktreeOpen(value); },
          items: [
            { id: 'local', label: t('local'), icon: h(IconFollowsystemOutlineRegular, { size: 16 }) },
            { id: 'new', label: h('span', { title: unavailable || t('newHint') }, t('new')), icon: h(IconBranchOutlineRegular, { size: 16 }), disabled: !!unavailable },
          ], selectedId: choice.mode, onSelect: setMode,
        }),
        h(NativeSelector, {
          label: loading ? t('loading') : branch || t('branch'), ariaLabel: t('branch'),
          title: binding?.mode === 'new' ? t('locked') : unavailable || (branches.length === 0 ? t('noBranches') : t(choice.mode === 'new' ? 'baseHint' : 'localHint')),
          disabled: loading || state.busy || !!unavailable || branches.length === 0 || binding?.mode === 'new',
          open: branchOpen, setOpen: (value) => { setWorktreeOpen(false); setBranchOpen(value); },
          items: branches.map((item) => ({ id: item.ref, label: item.name, icon: h(IconBranchOutlineRegular, { size: 16 }) })), selectedId: selectedBranch,
          onSelect: (ref) => {
            if (choice.mode === 'new') controller.choose(sessionId, { mode: 'new', baseRef: ref });
            else {
              const chosen = branches.find((item) => item.ref === ref);
              if (chosen && chosen.name !== info.currentBranch) {
                void controller.checkout(workspaceId, chosen.name).catch((error) => controller.report(error, 'checkoutError'));
              }
            }
          },
        }));
    }

    function GlobalOverlay({ controller, useSessions, useSessionStatus, t }) {
      const current = useStore(controller.dialog);
      const mainSessionId = useSessions((state) => Object.values(state.byId).find((session) => session.retainedBy.mainView > 0)?.id);
      const statuses = useSessionStatus((state) => state);
      const bindings = useSelected(controller.data, React.useCallback((state) => state.bindingBySession, []));
      const previousRunning = React.useRef(new Set());
      React.useEffect(() => { void controller.refresh(true); }, [controller, mainSessionId]);
      React.useEffect(() => {
        const update = () => { if (document.visibilityState === 'visible') void controller.refresh(); };
        const visible = () => { if (document.visibilityState === 'visible') void controller.refresh(true); };
        const timer = window.setInterval(update, 5000);
        document.addEventListener('visibilitychange', visible);
        return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
      }, [controller]);
      React.useEffect(() => {
        const next = new Set();
        for (const [id, status] of statuses) if (bindings.has(id) && status.running) next.add(id);
        if ([...previousRunning.current].some((id) => !next.has(id))) void controller.refresh(true);
        previousRunning.current = next;
      }, [controller, statuses, bindings]);
      const close = () => { if (current) controller.settleDialog(current, false); };
      return h(React.Fragment, null,
        h('style', { 'data-plugin': PREFIX, 'data-plugin-css': `${PREFIX}/client.css` }, CSS),
        h(Modal, {
          open: current !== null, onClose: close, closeLabel: t('close'),
          title: current?.kind === 'error' ? t(current.title) : t(current?.kind === 'delete' ? 'deleteTitle' : 'restoreTitle'),
          footer: current?.kind === 'error'
            ? h(Button, { variant: 'primary', className: `${PREFIX}-modalAction`, onClick: close }, t('close'))
            : h(React.Fragment, null,
              h(Button, { variant: 'outline', className: `${PREFIX}-modalAction`, onClick: close }, t('cancel')),
              h(Button, { variant: 'primary', className: `${PREFIX}-modalAction`, onClick: () => controller.settleDialog(current, true) }, t(current?.kind === 'delete' ? 'delete' : 'restore'))),
        }, current?.kind === 'error'
          ? h('pre', { className: `${PREFIX}-rawError`, role: 'alert' }, current.message)
          : h('div', { className: `${PREFIX}-dialogText` },
            t(current?.kind === 'delete' ? 'deleteBody' : 'restoreBody'),
            h('div', { className: `${PREFIX}-help` }, t('snapshotHelp')),
            current?.path ? h('div', { className: `${PREFIX}-path` }, current.path) : null)));
    }

    function useSessionWorktree(controller, sessionId) {
      return useSelected(controller.data, React.useCallback(state => {
        const binding = state.bindingBySession.get(sessionId);
        return binding?.mode === 'new' ? state.recordById.get(binding.worktreeId) : state.observedBySession.get(sessionId);
      }, [sessionId]));
    }

    function WorktreeMarker({ sessionId, controller, t }) {
      const record = useSessionWorktree(controller, sessionId);
      if (!record) return null;
      const base = branchLabel(record.baseRef);
      const detail = CLEANED.has(record.status) ? t(record.status)
        : record.external ? record.currentBranch || t('detached')
          : base ? t('basedOn', { branch: base }) : t('rowWorktree');
      const label = detail === t('rowWorktree') ? detail : `${t('rowWorktree')} · ${detail}`;
      return h('span', { className: MARKER, role: 'img', 'aria-label': label, title: label },
        h(IconBranchOutlineRegular, { size: 14, className: `${PREFIX}-rowIcon` }),
        h('span', { className: `${PREFIX}-rowInfo`, 'aria-hidden': true }, detail));
    }

    function WorktreeHover({ sessionId, controller, t }) {
      const record = useSessionWorktree(controller, sessionId);
      if (!record) return null;
      const lines = [
        CLEANED.has(record.status) ? t(record.status) : null,
        t('hoverPath', { path: record.path }),
        record.status === 'ready' && Object.hasOwn(record, 'currentBranch')
          ? t('hoverBranch', { branch: record.currentBranch || t('detached') }) : null,
      ];
      return h('div', { className: `${PREFIX}-hover` }, lines.filter(Boolean).map((line, index) =>
        h('div', { className: `${PREFIX}-hoverLine`, key: index }, line)));
    }

    function statusLabel(record, statuses, pinned, t) {
      const labels = [];
      if (record.sessionIds.some((id) => statuses.get(id)?.running)) labels.push(t('active'));
      if (record.sessionIds.some((id) => pinned.has(id))) labels.push(t('pinned'));
      if (record.protected && labels.length === 0 && record.status === 'ready') labels.push(t('protected'));
      if (record.status !== 'ready' || labels.length === 0) labels.push(t(record.status));
      return labels.join(' · ');
    }

    function RecordRow({ record, sessions, statuses, pinned, archived, controller, openSession, close, t }) {
      const [menuOpen, setMenuOpen] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const protectedRecord = record.protected || record.sessionIds.some((id) => pinned.has(id) || statuses.get(id)?.running);
      const transitioning = TRANSITIONAL.has(record.status);
      const title = record.sessionIds.map((id) => sessions[id]?.title || sessions[id]?.displayTitle).find(Boolean) || t('untitled');
      const act = async (action) => {
        setBusy(true);
        try { await controller.recordAction(action, record); }
        finally { setBusy(false); }
      };
      return h('article', { className: `${PREFIX}-record` },
        h('div', { className: `${PREFIX}-recordHead` },
          h('div', { className: `${PREFIX}-recordTitle`, title }, title),
          h('span', { className: `${PREFIX}-status` }, statusLabel(record, statuses, pinned, t))),
        h('div', { className: `${PREFIX}-path` }, record.path),
        record.baseRef ? h('div', { className: `${PREFIX}-help` }, t('basedOn', { branch: branchLabel(record.baseRef) })) : null,
        record.error ? h('div', { className: `${PREFIX}-error` }, record.error) : null,
        h('div', { className: `${PREFIX}-actions` },
          h(Menu, {
            open: menuOpen, onClose: () => setMenuOpen(false), portal: true, align: 'start',
            items: record.sessionIds.map((id) => ({
              id, disabled: archived.has(id),
              label: h('span', { title: archived.has(id) ? t('archivedHelp') : sessions[id]?.displayTitle || id },
                sessions[id]?.title || sessions[id]?.displayTitle || t('untitled'), archived.has(id) ? ` · ${t('archived')}` : ''),
            })),
            onSelect: (id) => { setMenuOpen(false); close(); openSession(id); },
            anchor: h(Button, {
              variant: 'outline', size: 'sm', disabled: record.sessionIds.length === 0,
              'aria-haspopup': 'menu', 'aria-expanded': menuOpen, onClick: () => setMenuOpen(!menuOpen),
            }, t('openSessions')),
          }),
          record.snapshotRef && (CLEANED.has(record.status) || record.status === 'error' || record.status === 'restoring') ? h(Button, {
            variant: 'outline', size: 'sm', disabled: busy || transitioning, onClick: () => { void act('restore'); },
          }, t('restore')) : null,
          !CLEANED.has(record.status) || record.archivePending ? h('span', { title: protectedRecord ? t('deleteProtected') : undefined },
            h(Button, {
              variant: 'outline', size: 'sm', disabled: busy || transitioning || protectedRecord,
              onClick: () => { void act('delete'); },
            }, t('delete'))) : null));
    }

    function SettingsSection({ controller, useSessions, useSessionStatus, useWorkspaces, openSession, pickDirectory, close, t }) {
      const state = useStore(controller.data);
      const sessions = useSessions((snapshot) => snapshot.byId);
      const statuses = useSessionStatus((snapshot) => snapshot);
      const workspace = useWorkspaces((snapshot) => snapshot);
      const pinned = React.useMemo(() => new Set(workspace.pinnedSessionIds), [workspace.pinnedSessionIds]);
      const archived = React.useMemo(() => new Set(workspace.archivedSessionIds), [workspace.archivedSessionIds]);
      const [directory, setDirectory] = React.useState('');
      const [maximum, setMaximum] = React.useState('15');
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const saving = React.useRef(false);
      const directoryDirty = React.useRef(false);
      const maximumDirty = React.useRef(false);
      const fieldId = React.useId();
      React.useEffect(() => {
        if (!state.config) return;
        if (!directoryDirty.current) setDirectory(state.config.directory);
        if (!maximumDirty.current) setMaximum(String(state.config.maxRetained));
      }, [state.config]);
      React.useEffect(() => {
        void controller.refresh(true);
        // Only the visible management page periodically checks external Git changes.
        const timer = window.setInterval(() => {
          if (document.visibilityState === 'visible') void controller.refresh(true);
        }, 30000);
        return () => window.clearInterval(timer);
      }, [controller]);
      const save = async (field, picked) => {
        if (saving.current || !state.config) return;
        const next = field === 'directory' ? (picked ?? directory).trim() : Number(maximum);
        if (field === 'directory' ? next === '' : !Number.isSafeInteger(next) || next < 1) {
          setError(t(field === 'directory' ? 'directoryRequired' : 'invalidMaximum'));
          return;
        }
        setError(null);
        if (field === 'directory') setDirectory(next);
        else setMaximum(String(next));
        if (next === state.config[field]) {
          if (field === 'directory') directoryDirty.current = false;
          else maximumDirty.current = false;
          return;
        }
        saving.current = true;
        setBusy(true);
        setError(null);
        try {
          await controller.call('configure', { [field]: next, expectedRevision: controller.data.getSnapshot().revision });
          if (field === 'directory') directoryDirty.current = false;
          else maximumDirty.current = false;
          await controller.refresh(true);
        } catch (reason) {
          setError(messageOf(reason));
        } finally {
          saving.current = false;
          setBusy(false);
        }
      };
      const groups = React.useMemo(() => {
        const result = new Map();
        for (const record of state.records) {
          const key = record.repositoryRoot || record.sourceRoot;
          if (!result.has(key)) result.set(key, []);
          result.get(key).push(record);
        }
        return [...result];
      }, [state.records]);
      const canPick = state.directoryPickerKind === 'native' || typeof globalThis.__DSH_DIRECTORY_PICKER__?.pick === 'function';
      return h('div', { className: `${PREFIX}-section` },
        h('div', { className: `${PREFIX}-setting` },
          h('div', { className: `${PREFIX}-settingLabel` },
            h('label', { className: `${PREFIX}-title`, htmlFor: `${fieldId}-directory` }, t('directory')),
            h('div', { className: `${PREFIX}-help`, id: `${fieldId}-directory-help` }, t('directoryHelp'))),
          h('div', { className: `${PREFIX}-field` },
            h('input', {
              id: `${fieldId}-directory`, className: `${PREFIX}-input`, value: directory,
              disabled: busy || !state.config, 'aria-describedby': `${fieldId}-directory-help`,
              onChange: (event) => { directoryDirty.current = true; setDirectory(event.target.value); },
              onBlur: () => { void save('directory'); },
              onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); void save('directory'); } },
            }),
            canPick ? h(Button, {
              variant: 'outline', size: 'sm', disabled: busy || !state.config,
              onClick: async () => {
                setError(null);
                try {
                  const path = await pickDirectory();
                  if (path !== null) { directoryDirty.current = true; setDirectory(path); await save('directory', path); }
                } catch (reason) { setError(messageOf(reason)); }
              },
            }, t('chooseDirectory')) : null)),
        h('div', { className: `${PREFIX}-setting` },
          h('div', { className: `${PREFIX}-settingLabel` },
            h('label', { className: `${PREFIX}-title`, htmlFor: `${fieldId}-maximum` }, t('maxRetained')),
            h('div', { className: `${PREFIX}-help`, id: `${fieldId}-maximum-help` }, t('retentionHelp'))),
          h('input', {
            id: `${fieldId}-maximum`, className: `${PREFIX}-input ${PREFIX}-number`, value: maximum,
            type: 'number', min: 1, step: 1, disabled: busy || !state.config,
            'aria-describedby': `${fieldId}-maximum-help`,
            onChange: (event) => { maximumDirty.current = true; setMaximum(event.target.value); },
            onBlur: () => { void save('maxRetained'); },
            onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); void save('maxRetained'); } },
          })),
        error || state.error ? h('div', { className: `${PREFIX}-error`, role: 'alert' }, error || state.error) : null,
        h('div', { className: `${PREFIX}-toolbar` }, h('div', { className: `${PREFIX}-title` }, t('managed')),
          h(Button, { variant: 'outline', size: 'sm', disabled: state.phase === 'loading', onClick: () => { void controller.refresh(true); } }, t('refresh'))),
        state.records.length === 0 ? h('div', { className: `${PREFIX}-help`, role: 'status' }, t(state.phase === 'loading' ? 'loading' : 'empty')) : null,
        groups.map(([repository, records]) => h('section', { key: repository },
          h('h3', { className: `${PREFIX}-repo`, title: repository }, basename(repository)),
          records.map((record) => h(RecordRow, { key: record.id, record, sessions, statuses, pinned, archived, controller, openSession, close, t })))));
    }

    return {
      inject: ['slots', 'locale', 'connection', 'conversation', 'uiWorkspace', 'workspaces'],
      apply(ctx) {
        for (const [locale, messages] of Object.entries(COPY)) {
          ctx.effect(() => ctx.locale.register(NS, locale, messages));
        }
        const controller = createController(ctx);
        const t = ctx.locale.bind(NS);
        ctx.effect(() => () => controller.dispose());
        ctx.effect(() => installSendGate(ctx, controller));
        installOpenInAdapter(ctx);
        ctx.on('connection/reset', () => controller.reset());
        const injected = () => ({ controller });
        ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options', id: PREFIX, order: 100, locale: NS, inject: injected,
        }, WorktreeOptions));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: `${PREFIX}-dialogs`, order: 1100, locale: NS, inject: injected,
        }, GlobalOverlay));
        ctx.slots.inject(ACTION_SLOT, () => ctx.slots.register({
          name: ACTION_SLOT, id: `${PREFIX}-marker`, order: 1100, locale: NS, inject: injected,
        }, WorktreeMarker));
        ctx.slots.inject('sidebar.session.row.hover', () => ctx.slots.register({
          name: 'sidebar.session.row.hover', id: `${PREFIX}-info`, order: 100, locale: NS, inject: injected,
        }, WorktreeHover));
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'worktrees', order: 250, label: () => t('nav'), locale: NS,
          inject: () => ({
            controller,
            openSession: (sessionId) => ctx.get('uiWorkspace').openSession(sessionId),
            pickDirectory: () => globalThis.__DSH_DIRECTORY_PICKER__?.pick
              ? globalThis.__DSH_DIRECTORY_PICKER__.pick() : ctx.get('uiWorkspace').pickDirectory(),
          }),
        }, SettingsSection));
      },
    };
  },
});
