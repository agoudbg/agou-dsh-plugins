import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canonical, commitAt, digest, exists, fail, git, inside, nulRecords, safeChild, samePath, treeEntries } from './git.js';

const MAX_FILES = 100_000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

/** Walk without following links, including ignored directories so embedded repositories cannot be destroyed. */
async function scan(root, signal) {
  const directories = [root];
  let count = 0;
  while (directories.length) {
    signal?.throwIfAborted();
    const directory = directories.pop();
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const names = new Set(entries.map(entry => entry.name.toLowerCase()));
    if (!samePath(root, directory) && (names.has('.git') || (names.has('head') && names.has('objects') && names.has('refs')))) {
      fail('NESTED_REPOSITORY', `An initialized submodule or embedded repository exists at ${directory}.`);
    }
    for (const entry of entries) {
      if (samePath(root, directory) && entry.name === '.git') continue;
      if (++count > MAX_FILES) fail('FILE_LIMIT', 'The checkout contains too many entries to snapshot safely.');
      if (entry.isDirectory()) directories.push(path.join(directory, entry.name));
      else if (!entry.isFile() && !entry.isSymbolicLink()) fail('SPECIAL_FILE', `Cannot snapshot the special filesystem entry ${path.join(directory, entry.name)}.`);
    }
  }
}

async function indexDigest(record) {
  const target = path.join(record.gitDir, 'index');
  const stat = await exists(target);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) fail('UNSAFE_INDEX', 'The checkout index is not an ordinary file.');
  return digest(await fs.readFile(target));
}

async function fileBytes(target, stat) {
  if (stat.isSymbolicLink()) return fs.readlink(target, { encoding: 'buffer' });
  if (!stat.isFile()) fail('SPECIAL_FILE', `Cannot snapshot the special filesystem entry ${target}.`);
  if (stat.size > MAX_FILE_BYTES) fail('FILE_LIMIT', `The file exceeds the ${MAX_FILE_BYTES} byte snapshot limit: ${target}.`);
  const handle = await fs.open(target, 'r');
  try {
    const opened = await handle.stat();
    if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size) fail('CHECKOUT_CHANGED', `The file changed while snapshotting: ${target}.`);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function assertParents(root, target) {
  let directory = path.dirname(target);
  while (!samePath(directory, root)) {
    if (!inside(root, directory)) fail('UNSAFE_TREE', 'A snapshot path escapes its checkout.');
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('UNSAFE_TREE', `A snapshot path traverses a link: ${directory}.`);
    directory = path.dirname(directory);
  }
}

async function currentTree(record, temporaryIndex, signal) {
  await scan(record.path, signal);
  const entries = treeEntries((await git(record.path, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], { signal })).bytes);
  const known = new Map(entries.map(entry => [entry.name, entry]));
  const index = await git(record.path, ['ls-files', '--stage', '-z'], { signal });
  for (const line of nulRecords(index.bytes)) {
    const match = /^(\d{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([0-3])\t([\s\S]+)$/.exec(line);
    if (!match) fail('INVALID_INDEX', 'Git returned an invalid index entry.');
    const name = match[4];
    if (match[1] === '160000' && match[3] !== '0') fail('SUBMODULE_CONFLICT', 'A conflicted submodule cannot be snapshotted safely.');
    if (!known.has(name) || match[3] === '0') known.set(name, { name, mode: match[1], oid: match[2] });
  }
  const untracked = await git(record.path, ['ls-files', '--others', '--exclude-standard', '-z'], { signal });
  for (const name of nulRecords(untracked.bytes)) if (!known.has(name)) known.set(name, { name, mode: '100644' });
  if (known.size > MAX_FILES) fail('FILE_LIMIT', 'The checkout contains too many files to snapshot safely.');
  const output = [];
  for (const item of [...known.values()].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
    signal?.throwIfAborted();
    const target = safeChild(record.path, item.name);
    const stat = await exists(target);
    if (!stat) continue;
    await assertParents(record.path, target);
    if (item.mode === '160000') {
      if (!stat.isDirectory() || (await fs.readdir(target)).length) fail('INITIALIZED_SUBMODULE', `The submodule at ${target} is initialized or contains files.`);
      output.push(`160000 ${item.oid}\t${item.name}\0`);
      continue;
    }
    if (stat.isDirectory()) continue;
    const bytes = await fileBytes(target, stat);
    const after = await fs.lstat(target);
    if (after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.mode !== stat.mode) {
      fail('CHECKOUT_CHANGED', `The file changed while snapshotting: ${target}.`);
    }
    const mode = stat.isSymbolicLink() ? '120000' : process.platform === 'win32'
      ? (item.mode === '100755' ? '100755' : '100644')
      : (stat.mode & 0o111 ? '100755' : '100644');
    const oid = (await git(record.path, ['hash-object', '-w', '--no-filters', '--stdin'], { signal, input: bytes })).stdout.trim();
    output.push(`${mode} ${oid}\t${item.name}\0`);
  }
  const env = { GIT_INDEX_FILE: temporaryIndex };
  await git(record.path, ['read-tree', '--empty'], { signal, env });
  if (output.length) await git(record.path, ['update-index', '-z', '--index-info'], { signal, env, input: Buffer.from(output.join('')) });
  return (await git(record.path, ['write-tree'], { signal, env })).stdout.trim();
}

async function withTemporaryIndex(callback) {
  const parent = await canonical(tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'dsh-worktrees-index-'));
  const index = path.join(directory, 'index');
  try {
    return await callback(index);
  } finally {
    if (!path.isAbsolute(directory) || !samePath(path.dirname(directory), parent) || !path.basename(directory).startsWith('dsh-worktrees-index-')) {
      fail('UNSAFE_TEMP', 'Refusing to clean an unverified temporary index directory.');
    }
    for (const file of [index, `${index}.lock`]) {
      const stat = await exists(file);
      if (stat && stat.isFile() && !stat.isSymbolicLink()) await fs.unlink(file);
    }
    await fs.rmdir(directory);
  }
}

/** Build objects without Git filters and never write to the checkout's index or stash. */
export async function makeSnapshot(record, signal) {
  const head = await commitAt(record.path, 'HEAD', signal);
  const originalIndex = await indexDigest(record);
  const tree = await withTemporaryIndex(index => currentTree(record, index, signal));
  if (await commitAt(record.path, 'HEAD', signal) !== head || await indexDigest(record) !== originalIndex) {
    fail('CHECKOUT_CHANGED', 'HEAD or the user index changed while creating the snapshot.');
  }
  const headTree = (await git(record.path, ['rev-parse', '--verify', 'HEAD^{tree}'], { signal })).stdout.trim();
  let commit = head;
  if (tree !== headTree) {
    commit = (await git(record.path, ['-c', 'commit.gpgSign=false', 'commit-tree', tree, '-p', head], {
      signal,
      input: Buffer.from(`DSH worktree snapshot ${record.id}\n`),
      env: {
        GIT_AUTHOR_NAME: 'DSH Worktrees', GIT_AUTHOR_EMAIL: 'worktrees@localhost',
        GIT_COMMITTER_NAME: 'DSH Worktrees', GIT_COMMITTER_EMAIL: 'worktrees@localhost',
      },
    })).stdout.trim();
  }
  return { commit, head, tree, index: originalIndex };
}

export async function assertSnapshotUnchanged(record, snapshot, signal) {
  if (await commitAt(record.path, 'HEAD', signal) !== snapshot.head || await indexDigest(record) !== snapshot.index) {
    fail('CHECKOUT_CHANGED', 'HEAD or the user index changed after creating the snapshot.');
  }
  const tree = await withTemporaryIndex(index => currentTree(record, index, signal));
  if (tree !== snapshot.tree || await commitAt(record.path, 'HEAD', signal) !== snapshot.head || await indexDigest(record) !== snapshot.index) {
    fail('CHECKOUT_CHANGED', 'Files, HEAD, or the user index changed after creating the snapshot. The checkout was kept.');
  }
}

/** Materialize raw blobs so .gitattributes cannot rewrite saved bytes during restoration. */
export async function materialize(record, commit, signal) {
  const entries = treeEntries((await git(record.path, ['ls-tree', '-r', '-z', '--full-tree', commit], { signal })).bytes);
  const allowed = new Set();
  for (const entry of entries) {
    safeChild(record.path, entry.name);
    let name = entry.name;
    while (name.includes('/')) {
      name = name.slice(0, name.lastIndexOf('/'));
      allowed.add(name);
    }
    allowed.add(entry.name);
  }
  const directories = [{ target: record.path, relative: '' }];
  while (directories.length) {
    signal?.throwIfAborted();
    const { target, relative } = directories.pop();
    for (const entry of await fs.readdir(target, { withFileTypes: true })) {
      if (!relative && entry.name === '.git') continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (!allowed.has(name)) fail('OCCUPIED_PATH', `The incomplete checkout contains an unexpected entry: ${name}.`);
      if (entry.isDirectory()) directories.push({ target: path.join(target, entry.name), relative: name });
    }
  }
  for (const entry of entries) {
    signal?.throwIfAborted();
    const target = safeChild(record.path, entry.name);
    const parentParts = entry.name.split('/').slice(0, -1);
    let parent = record.path;
    for (const part of parentParts) {
      parent = path.join(parent, part);
      const stat = await exists(parent);
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) fail('OCCUPIED_PATH', `A checkout directory is occupied: ${parent}.`);
      if (!stat) await fs.mkdir(parent);
    }
    const stat = await exists(target);
    if (entry.mode === '160000') {
      if (stat && (!stat.isDirectory() || (await fs.readdir(target)).length)) fail('INITIALIZED_SUBMODULE', `The submodule path is occupied: ${target}.`);
      if (!stat) await fs.mkdir(target);
      continue;
    }
    const bytes = (await git(record.path, ['cat-file', 'blob', entry.oid], { signal })).bytes;
    if (stat) {
      if (entry.mode === '120000' ? !stat.isSymbolicLink() : !stat.isFile() || stat.isSymbolicLink()) fail('OCCUPIED_PATH', `The checkout path has changed type: ${target}.`);
      if (!(await fileBytes(target, stat)).equals(bytes)) fail('OCCUPIED_PATH', `The incomplete checkout contains changed bytes: ${target}.`);
      continue;
    }
    if (entry.mode === '120000') {
      const linkTarget = process.platform === 'win32' ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : bytes;
      await fs.symlink(linkTarget, target);
    } else await fs.writeFile(target, bytes, { flag: 'wx', mode: entry.mode === '100755' ? 0o755 : 0o644 });
  }
  await git(record.path, ['read-tree', commit], { signal });
}
