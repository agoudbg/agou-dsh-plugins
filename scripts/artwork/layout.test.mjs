import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignIcons, areNeighbors, CARD_POSITIONS } from './layout.mjs';

const icons = (count) => Array.from({ length: count }, (_, index) => ({ name: `icon-${index}` }));

function verifyArrangement(result, available) {
  assert.deepEqual(result.map(({ x, y }) => [x, y]), CARD_POSITIONS);
  const counts = new Map(available.map(({ name }) => [name, 0]));
  for (const card of result) counts.set(card.icon.name, counts.get(card.icon.name) + 1);
  assert.ok(Math.max(...counts.values()) - Math.min(...counts.values()) <= 1);
  // Verify output geometry directly, independently of the graph's helper.
  for (let a = 0; a < result.length; a++) {
    for (let b = a + 1; b < result.length; b++) {
      const dx = Math.abs(result[a].x - result[b].x);
      const dy = Math.abs(result[a].y - result[b].y);
      if (dx <= 188 && dy <= 94) {
        assert.notEqual(result[a].icon.name, result[b].icon.name,
          `Adjacent duplicate between (${result[a].x},${result[a].y}) and (${result[b].x},${result[b].y})`);
      }
    }
  }
}

test('horizontal, vertical, and diagonal neighbors include the exact boundaries', () => {
  const origin = { x: 0, y: 0 };
  assert.ok(areNeighbors(origin, { x: 188, y: 0 }));
  assert.ok(areNeighbors(origin, { x: 0, y: 94 }));
  assert.ok(areNeighbors(origin, { x: 188, y: 94 }));
  assert.ok(areNeighbors(origin, { x: -188, y: -94 }));
  assert.ok(!areNeighbors(origin, { x: 189, y: 94 }));
  assert.ok(!areNeighbors(origin, { x: 188, y: 95 }));
});

test('nine plugin icons remain balanced and non-adjacent across 100 seeds', () => {
  const available = icons(9);
  for (let seed = 0; seed < 100; seed++) verifyArrangement(assignIcons(available, `seed-${seed}`), available);
});

test('the seed is repeatable and independent of input enumeration order', () => {
  const available = icons(9);
  const first = assignIcons(available, 'stable');
  assert.deepEqual(assignIcons(available, 'stable'), first);
  assert.deepEqual(assignIcons([...available].reverse(), 'stable'), first);
  assert.notDeepEqual(assignIcons(available, 'different'), first);
});

test('five through thirty plugin icons preserve counts and forbid adjacency', () => {
  for (let count = 5; count <= 30; count++) {
    const available = icons(count);
    verifyArrangement(assignIcons(available), available);
  }
});

test('insufficient or duplicate icon names fail instead of relaxing the rule', () => {
  for (let count = 0; count < 5; count++) assert.throws(() => assignIcons(icons(count)), /At least 5/);
  assert.throws(() => assignIcons([{ name: 'same' }, { name: 'same' }]), /must be unique/);
});
