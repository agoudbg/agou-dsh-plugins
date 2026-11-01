import path from 'node:path';
import Schema from '@deepseek-ai/schemastery';
import { z } from 'zod';
import { createInitialState, validateState } from './lib/manager.js';
import { WorktreeHost } from './host.js';
import { registerTransport } from './transport.js';

export const name = 'worktrees';
export const inject = ['storageDomain', 'workspaceRegistry', 'sessionController', 'agents', 'workingDirectory', 'connection', 'settings', 'systemPrompt', 'tools'];
export const Config = Schema.object({
  directory: Schema.string().description('Absolute directory for newly created managed worktrees.').volatile(),
  maxRetained: Schema.number().min(1).max(Number.MAX_SAFE_INTEGER).step(1).default(15).description('Eligible worktrees retained after protected checkouts are excluded.').volatile(),
});

const stateSchema = z.unknown().transform((value, context) => {
  try { return validateState(value); }
  catch (error) {
    context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : String(error) });
    return z.NEVER;
  }
});
const domainSpec = {
  name: 'dsh_worktrees',
  version: 1,
  tables: {},
  global: { schema: stateSchema, initial: createInitialState() },
};

// Strict tool schemas may require unused optional fields to be present.
const optionalText = maximum => z.preprocess(value => value === '' ? undefined : value, z.string().min(1).max(maximum).optional());
const optionalRetention = z.preprocess(value => value === 0 ? undefined : value, z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional());
const optionalRevision = z.preprocess(value => value === -1 ? undefined : value, z.number().int().nonnegative().optional());

export function registerInfoTool(ctx, host) {
  const input = z.object({
    action: z.enum(['status', 'list', 'branches']),
    workspace_id: optionalText(256),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(50).default(20),
  }).strict();
  ctx.tools.register({
    name: 'worktree_info',
    description: 'Inspect the current session worktree, list managed worktrees, or list a workspace’s existing Git branches. Reads only; does not create, checkout, restore, delete, or change settings. Lists are paginated with offset and limit.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'list', 'branches'] },
        workspace_id: { type: 'string', description: 'Registered workspace id. Omit or use an empty string for the current session workspace.' },
        offset: { type: 'integer', minimum: 0, default: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      const request = input.parse(args);
      if (!exec.agent) throw new Error('A session is required to inspect its worktree.');
      const workspace = request.workspace_id ? host.workspace(request.workspace_id) : host.workspaceFor(exec.agent.session);
      if (request.action === 'branches') {
        if (!workspace) return { text: 'This session has no registered workspace or managed worktree.' };
        const info = await host.manager.inspectWorkspace(workspace, exec.signal);
        return { text: JSON.stringify({ workspaceId: workspace.workspaceId, currentBranch: info.currentBranch, head: info.head, defaultBase: info.defaultBase, branches: info.branches.slice(request.offset, request.offset + request.limit), total: info.branches.length }) };
      }
      const state = host.manager.list();
      const binding = state.bindings[exec.agent.id];
      const rows = request.action === 'status'
        ? (binding?.worktreeId ? [state.worktrees[binding.worktreeId]] : [])
        : Object.values(state.worktrees).filter(record => record.workspaceId === workspace?.workspaceId);
      return { text: JSON.stringify({ workspaceId: workspace?.workspaceId ?? null, binding: binding ?? null, records: rows.slice(request.offset, request.offset + request.limit).map(({ token: _token, ...record }) => record), total: rows.length, config: host.configuration(), revision: host.descriptor().revision }) };
    },
  });
}

export function registerManagementTool(ctx, host) {
  const input = z.object({
    action: z.enum(['prepare', 'checkout', 'restore', 'remove', 'configure']),
    session_id: optionalText(256),
    workspace_id: optionalText(256),
    worktree_id: optionalText(256),
    mode: z.enum(['local', 'new']).optional(),
    branch: optionalText(4096),
    directory: optionalText(32767),
    max_retained: optionalRetention,
    expected_revision: optionalRevision,
  }).strict();
  ctx.tools.register({
    name: 'worktree_manage',
    description: 'Request a managed worktree operation. prepare selects Local or a detached worktree for a blank session before its first message; it does not send a message. checkout immediately changes the source workspace branch. restore recovers a saved snapshot; remove snapshots first and archives linked chats. configure changes the new-worktree directory or soft retention count. Each mutation uses the Host’s normal approval flow; this tool cannot approve its own request.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['prepare', 'checkout', 'restore', 'remove', 'configure'] },
        session_id: { type: 'string', description: 'Session for prepare. Omit or use an empty string for the calling session; new selection requires a blank session.' },
        workspace_id: { type: 'string', description: 'Registered source workspace for checkout. Omit or use an empty string for the calling session workspace.' },
        worktree_id: { type: 'string', description: 'Managed id from worktree_info, required for restore/remove. Use an empty string for other actions.' },
        mode: { type: 'string', enum: ['local', 'new'], description: 'Required for prepare; ignored for other actions.' },
        branch: { type: 'string', description: 'Existing local branch for checkout, or base ref for prepare(new). Omit or use an empty string when unused.' },
        directory: { type: 'string', description: 'Absolute Host path for future worktrees, for configure. Omit or use an empty string to keep the current directory.' },
        max_retained: { type: 'integer', minimum: 0, description: 'Soft eligible-worktree retention target, for configure. Omit or use 0 to keep the current target.' },
        expected_revision: { type: 'integer', minimum: -1, description: 'Settings revision from worktree_info. Omit or use -1 for the current revision; 0 is a valid explicit revision.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      const request = input.parse(args);
      if (!exec.agent) throw new Error('A calling session is required for a worktree operation.');
      let result;
      switch (request.action) {
        case 'prepare': {
          if (!request.mode) throw new Error('prepare requires mode.');
          const caller = { id: `tool:${exec.callId}`, signal: exec.signal };
          const operation = { sessionId: request.session_id ?? exec.agent.id, operationId: exec.callId, choice: { mode: request.mode, ...(request.branch ? { baseRef: request.branch } : {}) } };
          try { result = await host.prepare(operation, caller, exec.signal); }
          finally { await host.settle(operation, caller); }
          break;
        }
        case 'checkout': {
          if (!request.branch) throw new Error('checkout requires branch.');
          const workspace = request.workspace_id ? host.workspace(request.workspace_id) : host.workspaceFor(exec.agent.session);
          if (!workspace) throw new Error('This session has no registered workspace.');
          const value = await host.manager.checkout(workspace, request.branch, exec.signal);
          result = { workspaceId: value.workspaceId, currentBranch: value.currentBranch, head: value.head };
          break;
        }
        case 'restore':
        case 'remove':
          if (!request.worktree_id) throw new Error(`${request.action} requires worktree_id.`);
          result = await host[request.action](request.worktree_id, exec.signal);
          break;
        case 'configure':
          result = await host.configure({
            ...(request.directory ? { directory: request.directory } : {}),
            ...(request.max_retained !== undefined ? { maxRetained: request.max_retained } : {}),
            expectedRevision: request.expected_revision ?? host.descriptor().revision,
          });
          break;
        default: throw new Error('Unknown worktree action.');
      }
      return { text: JSON.stringify(result) };
    },
  });
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (exec.name !== 'worktree_manage' || decision.kind !== 'allow') return decision;
    const action = input.parse(exec.arguments).action;
    return {
      kind: 'ask',
      reason: `Allow managed worktree operation: ${action}`,
      displayReason: { en: `Allow managed worktree operation: ${action}`, zh: `允许执行工作树操作：${action}` },
    };
  });
}

export function registerHostEvents(ctx, host) {
  ctx.on('session/event', (session, event) => {
    host.observe(session, event);
    if (event.type === 'turn/end') host.requestCleanup();
  });
  ctx.on('domain/changed', change => {
    if (change.domain !== 'workspace') return;
    host.requestCleanup();
  });
  ctx.on('agent/created', async ({ agent, signal }) => {
    host.reconciled.delete(agent.id);
    await host.inherit(agent, signal);
    await host.reconcile(agent.session);
  });
  ctx.on('session/disposed', session => {
    host.reconciled.delete(session.id);
    host.accepting.delete(session.id);
  });
  // This guard runs before native ensure() can recover a missing cwd to its original workspace.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    if (context.agent) await host.assertAvailable(context.agent, context.signal);
    return next();
  }, { prepend: true });
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    await host.assertAvailable(agent, signal);
    return next();
  });
}

export async function apply(ctx, config) {
  if (!path.isAbsolute(config.directory.get())) throw new Error('dsh-worktrees: directory must be an absolute path.');
  const domain = await ctx.storageDomain.open(domainSpec);
  const host = new WorktreeHost(ctx, config, { get: () => domain.global.get(), set: value => domain.global.set(value) });
  ctx.effect(() => async () => {
    await host.dispose();
    await domain.close();
  });
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber));
  registerTransport(ctx, host);
  registerHostEvents(ctx, host);
  ctx.systemPrompt.context({
    name: 'worktrees:current',
    order: ctx.systemPrompt.getContextOrder('WORKING_DIRECTORY') + 1,
    interpolate: false,
    required: true,
    text: context => host.context(context.agent),
  });
  registerInfoTool(ctx, host);
  registerManagementTool(ctx, host);
  await host.start();
}
