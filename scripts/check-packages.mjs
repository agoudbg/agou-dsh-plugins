#!/usr/bin/env node
/**
 * Validates every package under packages/ for publish readiness.
 * Zero dependencies; run with `node scripts/check-packages.mjs`.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.join(root, 'packages');
const errors = [];

const fail = (pkg, message) => errors.push(`${pkg}: ${message}`);
const say = (message) => console.log(`  ok: ${message}`);

// Windows: npm is npm.cmd, which Node refuses to spawn without a shell.
const npm = (args, options = {}) =>
  spawnSync('npm', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });

/** Resolves a files/exports pattern (may contain one `*`) to matching files, or [] if none. */
function matchPattern(packageDir, pattern) {
  const literal = path.join(packageDir, pattern);
  if (existsSync(literal) && statSync(literal).isFile()) return [pattern];
  if (!pattern.includes('*')) return [];
  const base = path.posix.dirname(pattern);
  const baseDir = path.join(packageDir, base);
  if (!existsSync(baseDir) || !statSync(baseDir).isDirectory()) return [];
  const regex = new RegExp(
    `^${path.posix
      .basename(pattern)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')}$`,
  );
  return readdirSync(baseDir)
    .filter((name) => regex.test(name))
    .map((name) => path.posix.join(base, name));
}

const dirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (dirs.length === 0) errors.push('no packages found under packages/');

for (const dirName of dirs) {
  const packageDir = path.join(packagesDir, dirName);
  const manifestPath = path.join(packageDir, 'package.json');
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(dirName, `package.json is unreadable or invalid JSON (${error.message})`);
    continue;
  }

  if (pkg.name !== dirName) fail(dirName, `package name "${pkg.name}" must match directory name`);
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? '')) {
    fail(dirName, `version "${pkg.version}" is not valid semver`);
  }
  if (typeof pkg.engines?.dsh !== 'string' || pkg.engines.dsh.length === 0) {
    fail(dirName, 'engines.dsh must be a non-empty string');
  }

  const patchPath = pkg.dsh?.bundle?.patch;
  if (typeof patchPath !== 'string' || !existsSync(path.join(packageDir, patchPath))) {
    fail(dirName, `dsh.bundle.patch "${patchPath ?? '(missing)'}" does not point to a file`);
  } else {
    say(`bundle patch ${patchPath}`);
  }

  for (const pattern of pkg.files ?? []) {
    if (matchPattern(packageDir, pattern).length === 0) {
      fail(dirName, `files entry "${pattern}" matches no file`);
    }
  }
  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    fail(dirName, 'files must be a non-empty array');
  }

  const entryExport = pkg.exports?.['.'];
  if (typeof entryExport !== 'string') {
    fail(dirName, 'exports["."] must be a string path');
    continue;
  }
  for (const [key, target] of Object.entries(pkg.exports)) {
    if (typeof target !== 'string') continue; // conditional exports are out of scope here
    if (matchPattern(packageDir, target).length === 0) {
      fail(dirName, `exports["${key}"] target "${target}" matches no file`);
    }
  }

  const entryFile = path.join(packageDir, entryExport);
  const syntax = spawnSync(process.execPath, ['--check', entryFile], { encoding: 'utf8' });
  if (syntax.status !== 0) {
    fail(dirName, `entry file ${entryExport} fails syntax check:\n${syntax.stderr}`);
  } else {
    say(`entry syntax ${entryExport}`);
  }

  const pack = npm(['pack', '--dry-run'], { cwd: packageDir });
  if (pack.status !== 0) {
    fail(dirName, `npm pack --dry-run failed:\n${pack.stderr || pack.stdout}`);
  } else {
    say(`npm pack ${pkg.name}@${pkg.version}`);
  }
}

console.log(`\n${dirs.length} package(s) checked, ${errors.length} error(s).`);
if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}
