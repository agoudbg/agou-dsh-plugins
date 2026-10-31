import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const fixtures = new URL('../../../dist/pasted-text-locale-tests/', import.meta.url);

function fixture() {
  mkdirSync(fixtures, { recursive: true });
  const directory = mkdtempSync(new URL('run-', fixtures));
  mkdirSync(join(directory, 'scripts'));
  mkdirSync(join(directory, 'locale'));
  copyFileSync(new URL('scripts/build-locales.mjs', root), join(directory, 'scripts/build-locales.mjs'));
  copyFileSync(new URL('client.js', root), join(directory, 'client.js'));
  for (const locale of ['en', 'zh']) {
    copyFileSync(new URL(`locale/${locale}.json`, root), join(directory, 'locale', `${locale}.json`));
  }
  return directory;
}

function build(directory, ...args) {
  return spawnSync(process.execPath, [join(directory, 'scripts/build-locales.mjs'), ...args], {
    encoding: 'utf8',
  });
}

function artifact(directory) {
  let registration;
  runInNewContext(readFileSync(join(directory, 'client.locales.js'), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { registration = value; } } },
  });
  assert.equal(registration.id, 'dsh-pasted-text-file');
  assert.equal(registration.chunk, 'client.locales.js');
  return JSON.parse(JSON.stringify(registration.factory()));
}

function updateLocale(directory, locale, change) {
  const file = join(directory, 'locale', `${locale}.json`);
  const document = JSON.parse(readFileSync(file, 'utf8'));
  change(document);
  writeFileSync(file, JSON.stringify(document));
}

test('generated browser dictionaries follow JSON edits and omit display metadata', () => {
  const directory = fixture();
  assert.equal(build(directory).status, 0);
  const before = artifact(directory);
  for (const locale of ['en', 'zh']) {
    const { meta, ...dictionary } = JSON.parse(readFileSync(join(directory, 'locale', `${locale}.json`), 'utf8'));
    assert.deepEqual(before[locale], dictionary);
    assert.equal('meta' in before[locale], false);
  }
  updateLocale(directory, 'en', (document) => {
    document.restore = 'Restored from edited JSON';
    document.fileName = 'Edited JSON.txt';
  });
  const stale = build(directory, '--check');
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /resource is stale/);
  assert.equal(build(directory).status, 0);
  const after = artifact(directory);
  assert.equal(after.en.restore, 'Restored from edited JSON');
  assert.equal(after.en.fileName, 'Edited JSON.txt');
  assert.deepEqual(after.zh, before.zh);
  assert.equal(build(directory, '--check').status, 0);
});

test('invalid or unbalanced locale data fails before replacing the valid artifact', () => {
  const directory = fixture();
  assert.equal(build(directory).status, 0);
  const original = readFileSync(join(directory, 'client.locales.js'), 'utf8');
  updateLocale(directory, 'en', (document) => { document.restore = 42; });
  const invalid = build(directory);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /en\.json must be strings/);
  assert.equal(readFileSync(join(directory, 'client.locales.js'), 'utf8'), original);
  updateLocale(directory, 'en', (document) => { delete document.restore; });
  const unbalanced = build(directory);
  assert.equal(unbalanced.status, 1);
  assert.match(unbalanced.stderr, /keys must match/);
  assert.equal(readFileSync(join(directory, 'client.locales.js'), 'utf8'), original);
  writeFileSync(join(directory, 'locale', 'en.json'), '{');
  const malformed = build(directory);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /Cannot read locale\/en\.json/);
  assert.equal(readFileSync(join(directory, 'client.locales.js'), 'utf8'), original);
});
