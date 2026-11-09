#!/usr/bin/env node
// Regenerates the banner artwork from packages/*/icon.svg and reports drift.
// With --commit it records the result as a bot commit and pushes it to main,
// so a plugin icon change lands together with the artwork that mirrors it.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTWORK_DIR = 'docs/assets/brand';
const MAX_ATTEMPTS = 3;
const { values } = parseArgs({
  options: {
    commit: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log('Usage: node scripts/refresh-artwork.mjs [--commit]');
  console.log('');
  console.log('Regenerates docs/assets/brand from the committed plugin icons.');
  console.log('Without --commit it rewrites the files and reports what changed.');
  console.log('With --commit it commits them as github-actions[bot] and pushes to main.');
} else {
  // --commit falls back to resetting onto origin/main when a push loses a race,
  // so anything the user still has in progress must be refused up front.
  if (values.commit) requireCleanWorktree();

  let settled = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    generate();
    const changes = describeChanges();
    if (changes.length === 0) {
      console.log('artwork is up to date.');
      settled = true;
      break;
    }
    console.log(`artwork changed:\n${changes.map((line) => `  ${line}`).join('\n')}`);
    if (!values.commit) {
      console.log('not committed; re-run with --commit to record this artwork.');
      settled = true;
      break;
    }
    commit();
    if (push()) {
      settled = true;
      break;
    }
    // Someone landed a commit first. Their push may have changed the icon set,
    // so regenerate from their tip instead of rebasing output we already wrote.
    console.warn(`main moved; regenerating on top of origin/main (attempt ${attempt}/${MAX_ATTEMPTS}).`);
    run('git', ['fetch', 'origin', 'main']);
    run('git', ['reset', '--hard', 'origin/main']);
  }
  if (!settled) {
    throw new Error(
      `could not push the artwork refresh after ${MAX_ATTEMPTS} attempts; ` +
        'the next push to main regenerates it.',
    );
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return result;
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

function generate() {
  run(process.execPath, [path.join(root, 'scripts/generate-artwork.mjs')]);
}

// Porcelain entries look like " M path" or "R  from -> path"; compare the
// resolved target path so renames into or out of the artwork directory count.
function changedPaths(args) {
  return capture('git', ['status', '--porcelain', '-z', ...args])
    .split('\0')
    .filter(Boolean)
    .map((entry) => entry.slice(3))
    .filter((entry) => !entry.includes(' -> '));
}

function describeChanges() {
  return capture('git', ['status', '--porcelain', '--', ARTWORK_DIR])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function requireCleanWorktree() {
  const dirty = changedPaths(['--untracked-files=all'])
    .filter((file) => path.posix.dirname(file) !== ARTWORK_DIR);
  if (dirty.length > 0) {
    throw new Error(
      `--commit requires every change outside ${ARTWORK_DIR} to be committed first; uncommitted:\n` +
        dirty.map((file) => `  ${file}`).join('\n'),
    );
  }
}

function commit() {
  run('git', ['add', '--', ARTWORK_DIR]);
  // The runner has no signing key, and rendering is byte-identical across
  // platforms, so this commit only ever adds regenerated files.
  run('git', [
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    'chore: refresh banner artwork',
  ]);
}

function push() {
  const result = spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/main'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status === 0) {
    console.log('pushed artwork refresh.');
    return true;
  }
  console.warn(`push rejected: ${(result.stderr || result.stdout || '').trim()}`);
  return false;
}
