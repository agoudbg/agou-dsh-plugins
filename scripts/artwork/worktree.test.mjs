import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePorcelainZ, pathsOutside } from './worktree.mjs';

test('parses modified and untracked records', () => {
  const entries = parsePorcelainZ(' M README.md\0?? notes.txt\0');
  assert.deepEqual(entries, [
    { status: ' M', path: 'README.md' },
    { status: '??', path: 'notes.txt' },
  ]);
});

test('keeps the original path of a rename instead of emitting it separately', () => {
  const entries = parsePorcelainZ('R  docs/assets/brand/keep.mjs\0scripts/keep.mjs\0');
  assert.deepEqual(entries, [
    {
      status: 'R ',
      path: 'docs/assets/brand/keep.mjs',
      originalPath: 'scripts/keep.mjs',
    },
  ]);
});

test('parses a staged rename followed by an unrelated record', () => {
  const entries = parsePorcelainZ('R  art/moved.svg\0outside.svg\0 M other.md\0');
  assert.deepEqual(entries.map((entry) => entry.path), ['art/moved.svg', 'other.md']);
  assert.equal(entries[0].originalPath, 'outside.svg');
});

test('treats both sides of a rename as outside the artwork directory', () => {
  const movedIn = parsePorcelainZ('R  docs/assets/brand/keep.mjs\0scripts/keep.mjs\0');
  assert.deepEqual(pathsOutside(movedIn, 'docs/assets/brand'), ['scripts/keep.mjs']);

  const movedOut = parsePorcelainZ('R  scripts/keep.mjs\0docs/assets/brand/keep.mjs\0');
  assert.deepEqual(pathsOutside(movedOut, 'docs/assets/brand'), ['scripts/keep.mjs']);
});

test('ignores every path inside the artwork directory', () => {
  const entries = parsePorcelainZ(
    ' M docs/assets/brand/banner.svg\0?? docs/assets/brand/extra.png\0',
  );
  assert.deepEqual(pathsOutside(entries, 'docs/assets/brand'), []);
});

test('treats untracked files in nested directories as outside', () => {
  const entries = parsePorcelainZ('?? .tmp/guard-test.mjs\0');
  assert.deepEqual(pathsOutside(entries, 'docs/assets/brand'), ['.tmp/guard-test.mjs']);
});

test('a bare filename with no slash is outside the artwork directory', () => {
  const entries = parsePorcelainZ(' M notes.txt\0');
  assert.deepEqual(pathsOutside(entries, 'docs/assets/brand'), ['notes.txt']);
});

test('trims nothing from paths that contain spaces', () => {
  const entries = parsePorcelainZ(' M docs/artwork notes.md\0');
  assert.deepEqual(entries[0].path, 'docs/artwork notes.md');
});
