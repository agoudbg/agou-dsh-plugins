#!/usr/bin/env node
/**
 * Publishes every package whose version does not exist on npm yet and is
 * newer than the registry's latest. Intended to run in CI on every push to
 * main; a pushed version bump is the release confirmation. `--dry-run`
 * reports the decisions without publishing or tagging.
 *
 * After publishing (or when there is nothing to publish), the plugin market
 * index is regenerated from manifests, locales, icons, and git history, and
 * committed back to main when it changed. Published versions are recorded in
 * market/published.json and listed with an npm install source.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMarketIndex } from './build-market-index.mjs';

const dryRun = process.argv.includes('--dry-run');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.join(root, 'packages');
const publishRecordPath = path.join(root, 'market', 'published.json');

let publishRecord = [];
if (existsSync(publishRecordPath)) {
  const parsed = JSON.parse(readFileSync(publishRecordPath, 'utf8'));
  if (!Array.isArray(parsed.records)) {
    throw new Error('market/published.json must be { "records": [...] }');
  }
  publishRecord = parsed.records;
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === 'npm',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')}\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
};

// Non-throwing registry query: { status, stdout } where status 0 means found.
const npmView = (specifier, options = {}) =>
  spawnSync('npm', ['view', specifier, 'version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });

function parseSemver(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version ?? '');
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : null,
  };
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`invalid semver: ${!pa ? a : b}`);
  for (let i = 0; i < 3; i += 1) {
    if (pa.core[i] !== pb.core[i]) return Math.sign(pa.core[i] - pb.core[i]);
  }
  if (!pa.pre && !pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i += 1) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      if (Number(x) !== Number(y)) return Math.sign(Number(x) - Number(y));
    } else if (xNum) return -1;
    else if (yNum) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const dirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const pending = [];
for (const dirName of dirs) {
  const packageDir = path.join(packagesDir, dirName);
  const pkg = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const { name, version } = pkg;

  const exact = npmView(`${name}@${version}`);
  if (exact.status === 0 && exact.stdout.trim() === version) {
    console.log(`skip ${name}@${version}: already on npm`);
    continue;
  }

  const latest = npmView(name);
  if (latest.status === 0 && latest.stdout.trim()) {
    if (compareSemver(version, latest.stdout.trim()) <= 0) {
      throw new Error(
        `${name}: local version ${version} is not newer than npm latest ${latest.stdout.trim()}`,
      );
    }
    console.log(`publish ${name}@${version} (npm latest: ${latest.stdout.trim()})`);
  } else {
    console.log(`publish ${name}@${version} (new package)`);
  }
  pending.push({ dirName, name, version });
}

if (pending.length === 0) {
  console.log('\nnothing to publish.');
}

if (!dryRun && !process.env.NODE_AUTH_TOKEN) {
  console.error(
    `error: NPM_TOKEN secret is not set, cannot publish: ${pending
      .map((item) => `${item.name}@${item.version}`)
      .join(', ')}`,
  );
  process.exit(1);
}

let publishedCount = 0;
for (const { dirName, name, version } of pending) {
  if (dryRun) break;
  run('npm', ['publish', '--access', 'public'], { cwd: path.join(packagesDir, dirName) });
  publishRecord.push({ name, version, publishTimestamp: Math.floor(Date.now() / 1000) });
  const tag = `${name}@${version}`;
  run('git', ['tag', tag]);
  run('git', ['push', 'origin', 'refs/tags/' + tag]);
  run(
    'gh',
    ['release', 'create', tag, '--title', `${name} ${version}`, '--generate-notes'],
    { env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN } },
  );
  console.log(`released ${tag}`);
  publishedCount += 1;
}

console.log(
  `\n${dryRun ? `dry run: ${pending.length} package(s) would publish.` : `${publishedCount} package(s) published.`}`,
);

if (dryRun) {
  console.log('dry run: market index refresh skipped.');
} else {
  if (publishRecord.length > 0) {
    publishRecord.sort((a, b) => a.publishTimestamp - b.publishTimestamp);
    writeFileSync(publishRecordPath, `${JSON.stringify({ records: publishRecord }, null, 2)}\n`);
  }
  await refreshMarketIndex();
}

async function refreshMarketIndex() {
  const summary = await buildMarketIndex();
  // Same validation a DSH client runs; refuses to commit a broken index.
  const { MarketIndexError, parseMarketIndex } = await import(
    '@deepseek-ai/dsh-plugin-market-index'
  );
  const raw = JSON.parse(readFileSync(path.join(root, 'market', 'index.json'), 'utf8'));
  try {
    parseMarketIndex(raw, summary.url);
  } catch (err) {
    if (err instanceof MarketIndexError) throw new Error(`refreshed market index is invalid: ${err.message}`);
    throw err;
  }
  const status = spawnSync('git', ['status', '--porcelain', 'market'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (status.status !== 0) throw new Error(`git status failed: ${status.stderr}`);
  if (!status.stdout.trim()) {
    console.log('market index is up to date.');
    return;
  }
  console.log('market index changed; committing it back to main.');
  const git = (args) => run('git', args);
  git(['add', 'market']);
  git([
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit',
    '-m',
    'chore: refresh market index',
  ]);
  const push = spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/main'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (push.status !== 0) {
    // Non-fatal: whatever pushed in between refreshes the index on its own run.
    console.warn(
      `warning: index refresh not pushed (self-heals on the next push): ${(push.stderr || '').trim()}`,
    );
  } else {
    console.log('pushed market index refresh.');
  }
}
