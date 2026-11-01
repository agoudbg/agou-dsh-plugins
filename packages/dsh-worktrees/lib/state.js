import path from 'node:path';
import { samePath } from './git.js';

export function createInitialState() {
  return { version: 1, worktrees: {}, bindings: {}, preferences: {}, accepted: {} };
}

function check(condition, message) {
  if (!condition) throw new TypeError(`Invalid worktree state: ${message}`);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function text(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 8192 && !value.includes('\0');
}

function identifier(value) {
  return text(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
}

function timestamp(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function absolute(value) {
  return text(value) && path.isAbsolute(value);
}

function choice(value) {
  return object(value) && ['local', 'new'].includes(value.mode) && (value.mode === 'local' ? value.baseRef === undefined || text(value.baseRef) : text(value.baseRef));
}

function nullableText(value) {
  return value === null || text(value);
}

export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

/** Validate a complete aggregate before loading or persisting it; callers receive an independent value. */
export function validateState(value) {
  check(object(value) && value.version === 1, 'unsupported version');
  for (const name of ['worktrees', 'bindings', 'preferences', 'accepted']) check(object(value[name]), `${name} must be a map`);
  const statuses = ['creating', 'ready', 'snapshotting', 'removing', 'removed', 'restoring', 'missing', 'error'];
  for (const [id, record] of Object.entries(value.worktrees)) {
    check(object(record) && /^[a-f0-9-]{36}$/.test(id) && record.id === id, 'invalid worktree id');
    check(identifier(record.workspaceId) && typeof record.workspaceTitle === 'string', `invalid workspace for ${id}`);
    for (const name of ['sourceRoot', 'commonDir', 'managedRoot', 'path', 'originalPath']) check(absolute(record[name]), `invalid ${name} for ${id}`);
    check(samePath(record.path, record.originalPath), `changed original path for ${id}`);
    check(samePath(path.dirname(record.path), record.managedRoot) && path.basename(record.path) === `dsh-${id}`, `unsafe managed path for ${id}`);
    check(record.gitDir === null || (absolute(record.gitDir) && samePath(path.dirname(record.gitDir), path.join(record.commonDir, 'worktrees'))), `invalid Git admin directory for ${id}`);
    check(text(record.baseRef) && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.baseCommit), `invalid base for ${id}`);
    check(/^[a-f0-9]{64}$/.test(record.token), `invalid ownership token for ${id}`);
    check(timestamp(record.createdAt) && timestamp(record.lastUsedAt) && (record.ownerlessAt === null || timestamp(record.ownerlessAt)), `invalid timestamp for ${id}`);
    check(statuses.includes(record.status) && nullableText(record.error), `invalid lifecycle for ${id}`);
    check(record.currentBranch === undefined || nullableText(record.currentBranch), `invalid current branch for ${id}`);
    check(record.snapshotRef === `refs/dsh-worktrees/snapshots/${id}`, `invalid snapshot ref for ${id}`);
    for (const name of ['snapshotCommit', 'snapshotPendingCommit']) check(record[name] === null || /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record[name]), `invalid ${name} for ${id}`);
    check(Array.isArray(record.sessionIds) && record.sessionIds.every(identifier) && new Set(record.sessionIds).size === record.sessionIds.length, `invalid sessions for ${id}`);
    check(typeof record.materialized === 'boolean' && typeof record.archivePending === 'boolean', `invalid operation state for ${id}`);
    check(record.operationId === null || text(record.operationId), `invalid operation id for ${id}`);
    check(identifier(record.ownerSessionId), `invalid owner for ${id}`);
  }
  for (const [sessionId, binding] of Object.entries(value.bindings)) {
    check(identifier(sessionId) && object(binding) && binding.sessionId === sessionId && choice(binding), 'invalid binding');
    check(identifier(binding.workspaceId) && absolute(binding.workspacePath) && absolute(binding.path) && typeof binding.workspaceTitle === 'string', `invalid binding workspace for ${sessionId}`);
    check(timestamp(binding.preparedAt) && (binding.acceptedAt === null || timestamp(binding.acceptedAt)), `invalid binding time for ${sessionId}`);
    check(['pending', 'ready', 'error'].includes(binding.status) && nullableText(binding.error), `invalid binding status for ${sessionId}`);
    if (binding.mode === 'new') {
      const record = value.worktrees[binding.worktreeId];
      check(record && samePath(binding.path, record.path) && record.sessionIds.includes(sessionId), `missing worktree for ${sessionId}`);
    } else {
      check(binding.worktreeId === null && samePath(binding.path, binding.workspacePath), `invalid local binding for ${sessionId}`);
    }
  }
  for (const [workspaceId, preference] of Object.entries(value.preferences)) {
    check(identifier(workspaceId) && choice(preference) && timestamp(preference.acceptedAt) && identifier(preference.sessionId) && text(preference.requestId), 'invalid preference');
  }
  for (const [key, accepted] of Object.entries(value.accepted)) {
    check(object(accepted) && identifier(accepted.sessionId) && text(accepted.requestId) && timestamp(accepted.acceptedAt), 'invalid accepted request');
    check(key === JSON.stringify([accepted.sessionId, accepted.requestId]), 'invalid accepted request key');
  }
  return structuredClone(value);
}

export function requireIdentifier(value, name) {
  if (!identifier(value)) throw new TypeError(`${name} must be a nonempty identifier.`);
  return value;
}
