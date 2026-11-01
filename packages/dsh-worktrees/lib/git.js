import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';

const MAX_OUTPUT = 64 * 1024 * 1024;
const TIMEOUT = 60_000;

export class WorktreeError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'WorktreeError';
    this.code = code;
  }
}

export function fail(code, message) {
  throw new WorktreeError(code, message);
}

export function samePath(left, right) {
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(left) === normalize(right);
}

export function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export async function exists(target) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function canonical(target) {
  if (typeof target !== 'string' || !path.isAbsolute(target) || target.includes('\0')) {
    fail('INVALID_PATH', 'The directory must be an absolute filesystem path.');
  }
  return fs.realpath(target);
}

export function gitEnvironment(overrides = {}) {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  return {
    ...environment,
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_LFS_SKIP_SMUDGE: '1',
    ...overrides,
  };
}

/** Every Git argument is literal. Repository selectors and injected Git configuration are discarded. */
export async function git(cwd, args, options = {}) {
  const { signal, allowed = [0], input, env, maxOutput = MAX_OUTPUT, timeout = TIMEOUT } = options;
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let failure;
    let stdoutSize = 0;
    let stderrSize = 0;
    const stdout = [];
    const stderr = [];
    const child = spawn('git', [
      '-c', 'core.hooksPath=/dev/null',
      '-c', 'core.fsmonitor=false',
      '-c', 'core.untrackedCache=false',
      '-c', 'submodule.recurse=false',
      '-c', 'gc.auto=0',
      '-c', 'maintenance.auto=false',
      ...args,
    ], {
      cwd,
      env: gitEnvironment(env),
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stop = error => {
      failure ??= error;
      child.kill();
    };
    const abort = () => stop(signal.reason ?? new WorktreeError('ABORTED', 'The Git operation was cancelled.'));
    const timer = setTimeout(() => stop(new WorktreeError('GIT_TIMEOUT', `Git ${args[0]} exceeded ${timeout} ms.`)), timeout);
    timer.unref();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.on('error', error => { failure ??= error; });
    child.stdout.on('data', data => {
      stdoutSize += data.length;
      if (stdoutSize > maxOutput) stop(new WorktreeError('OUTPUT_LIMIT', 'Git output exceeded the safe capture limit.'));
      else stdout.push(data);
    });
    child.stderr.on('data', data => {
      stderrSize += data.length;
      if (stderrSize > maxOutput) stop(new WorktreeError('OUTPUT_LIMIT', 'Git error output exceeded the safe capture limit.'));
      else stderr.push(data);
    });
    child.stdin.on('error', error => {
      if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') stop(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      const output = Buffer.concat(stdout);
      if (failure) return reject(failure);
      if (!allowed.includes(code)) {
        return reject(new WorktreeError('GIT_FAILED', `Git ${args[0]} failed (${code}): ${Buffer.concat(stderr).toString('utf8').trim().slice(0, 4096)}`));
      }
      resolve({ stdout: output.toString('utf8'), bytes: output, code });
    });
    child.stdin.end(input);
  });
}

export async function filterOverrides(cwd, signal) {
  const configured = await git(cwd, ['config', '--null', '--name-only', '--get-regexp', '^filter\\.'], { signal, allowed: [0, 1] });
  const drivers = new Set();
  for (const key of configured.stdout.split('\0')) {
    const separator = key.lastIndexOf('.');
    if (separator > 7 && ['clean', 'smudge', 'process', 'required'].includes(key.slice(separator + 1))) drivers.add(key.slice(7, separator));
  }
  return [...drivers].flatMap(driver => ['clean', 'smudge', 'process', 'required'].flatMap(attribute => [
    '-c', `filter.${driver}.${attribute}=${attribute === 'required' ? 'false' : ''}`,
  ]));
}

export async function repository(directory, signal) {
  const real = await canonical(directory);
  const root = (await git(real, ['rev-parse', '--show-toplevel'], { signal })).stdout.replace(/\r?\n$/, '');
  const common = (await git(real, ['rev-parse', '--path-format=absolute', '--git-common-dir'], { signal })).stdout.replace(/\r?\n$/, '');
  return { root: await canonical(root), commonDir: await canonical(common) };
}

export async function commitAt(cwd, ref, signal, optional = false) {
  const result = await git(cwd, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], { signal, allowed: optional ? [0, 128] : [0] });
  if (result.code !== 0) return null;
  const value = result.stdout.trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)) fail('INVALID_OBJECT', 'Git returned an invalid commit identity.');
  return value;
}

/** Parse Git's NUL-delimited protocol, rejecting filenames that cannot round-trip safely. */
export function nulRecords(buffer) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return decoder.decode(buffer).split('\0').filter(Boolean);
}

export function treeEntries(buffer) {
  return nulRecords(buffer).map(line => {
    const match = /^(\d{6}) (blob|tree|commit) ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(line);
    if (!match) fail('INVALID_TREE', 'Git returned an invalid tree entry.');
    return { mode: match[1], type: match[2], oid: match[3], name: match[4] };
  });
}

export function safeChild(root, name) {
  const parts = typeof name === 'string' ? name.split('/') : [];
  const unsafeWindows = process.platform === 'win32' && parts.some(part => /[:<>"|?*\u0000-\u001f]/.test(part) || /[. ]$/.test(part) || /^(?:con(?:in\$|out\$)?|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(part));
  if (!name || name.includes('\\') || unsafeWindows || parts.some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) {
    fail('UNSAFE_TREE', `The Git tree contains an unsafe path: ${JSON.stringify(name)}.`);
  }
  const target = path.resolve(root, ...name.split('/'));
  if (!inside(root, target) || samePath(root, target)) fail('UNSAFE_TREE', 'The Git tree escapes the checkout directory.');
  return target;
}

export function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function bounded(promise, signal) {
  signal?.throwIfAborted();
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new WorktreeError('ABORTED', 'The operation was cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}
