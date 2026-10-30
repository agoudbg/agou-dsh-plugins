#!/usr/bin/env node
/**
 * Flags "version" changes in the package.json files under packages/ between
 * a PR base ref and head SHA. External contributors get a failing check so
 * accidental publishes are visible at merge time; allowed authors pass with
 * a notice of what merging will publish.
 *
 * Env: BASE_REF (committish of the PR base), HEAD_SHA, PR_AUTHOR,
 *      ALLOWED_AUTHORS (comma-separated logins).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { BASE_REF, HEAD_SHA, PR_AUTHOR } = process.env;
if (!BASE_REF || !HEAD_SHA || !PR_AUTHOR) {
  console.error('error: BASE_REF, HEAD_SHA, and PR_AUTHOR must be set (pull_request event only).');
  process.exit(1);
}
const allowedAuthors = (process.env.ALLOWED_AUTHORS ?? '')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);
const isMaintainer = allowedAuthors.includes(PR_AUTHOR.trim().toLowerCase());

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const showPackage = (ref, file) => {
  const result = spawnSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
};

const dirs = readdirSync(path.join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const changes = [];
for (const dir of dirs) {
  const file = `packages/${dir}/package.json`;
  const head = showPackage(HEAD_SHA, file);
  if (!head) continue; // package absent at head: merging cannot publish it
  const base = showPackage(BASE_REF, file);
  if (base?.version === head.version) continue;
  changes.push(
    base
      ? `${head.name}: ${base.version} -> ${head.version}`
      : `${head.name}: new package @ ${head.version}`,
  );
}

if (changes.length === 0) {
  console.log('no version changes in this PR.');
  process.exit(0);
}

const summary = changes.join('\n  ');
if (isMaintainer) {
  console.log(`notice: merging this PR will publish:\n  ${summary}`);
  process.exit(0);
}

console.error(`error: this PR edits "version" in the packages/ manifests:\n  ${summary}`);
console.error(
  'Merging it would publish those packages to npm. Releases are cut by the maintainer: please drop the version edits.',
);
process.exit(1);
