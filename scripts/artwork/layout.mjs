// Measurements use the supplied 1280 × 440 PowerToys reference at native size.
export const WIDTH = 1280;
export const HEIGHT = 440;
export const CARD_SIZE = 68;
export const ICON_SIZE = 44;
export const BRAND_BORDER_WIDTH = 4;
export const DEFAULT_SEED = 'agou-dsh-plugins-v1';
export const CARD_POSITIONS = [
  [136, 14],
  [230, -33], [230, 61],
  [324, 14], [324, 108],
  [418, -33], [418, 61], [418, 155],
  [512, 14], [512, 108], [512, 202],
  [606, -49], [606, 45], [606, 139],
  [700, 14], [700, 108], [700, 202],
  [794, -33], [794, 61], [794, 155],
  [888, 14], [888, 108],
  [982, -33], [982, 61],
  [1076, 14],
];

export const BRAND_BOX = { x: 606, y: 233, width: CARD_SIZE, height: CARD_SIZE };

/** Include staggered horizontal neighbors and both diagonal directions. */
export function areNeighbors(a, b) {
  return Math.abs(a.x - b.x) <= 188 && Math.abs(a.y - b.y) <= 94;
}

const positions = CARD_POSITIONS.map(([x, y], index) => ({ x, y, index }));
const neighbors = positions.map((position) => positions
  .filter((other) => other.index !== position.index && areNeighbors(position, other))
  .map((other) => other.index));

/** Fixed PRNG: independent of the clock, locale, and filesystem order. */
function randomFromSeed(seed) {
  let state = 2166136261;
  for (const character of seed) {
    state = Math.imul(state ^ character.codePointAt(0), 16777619) >>> 0;
  }
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Color the adjacency graph with balanced icon quotas. Neighbor conflicts are
 * forbidden, rather than penalized. Seeded tie-breaks make the search repeatable.
 */
export function assignIcons(icons, seed = DEFAULT_SEED) {
  if (new Set(icons.map((icon) => icon.name)).size !== icons.length) {
    throw new Error('Plugin icon names must be unique.');
  }
  // Five mutually adjacent cards occur at x=324..512 and y=14..108.
  if (icons.length < 5) {
    throw new Error('At least 5 distinct plugin icons are required to fill this layout without adjacent duplicates.');
  }
  const random = randomFromSeed(seed);
  const palette = [...icons].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (let index = palette.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [palette[index], palette[swap]] = [palette[swap], palette[index]];
  }
  palette.length = Math.min(palette.length, positions.length);
  const remaining = palette.map((_, index) =>
    Math.floor(positions.length / palette.length) + (index < positions.length % palette.length ? 1 : 0));
  const assigned = positions.map(() => -1);
  const priorities = positions.map(() => palette.map(() => random()));
  let visited = 0;

  const allowed = (position, color) => remaining[color] > 0
    && neighbors[position].every((neighbor) => assigned[neighbor] !== color);
  const distanceFromCopies = (position, color) => Math.min(1000, ...positions
    .filter((other) => assigned[other.index] === color)
    .map((other) => Math.hypot(other.x - positions[position].x, other.y - positions[position].y)));

  function search(count) {
    if (count === positions.length) return true;
    if (++visited > 200_000) {
      throw new Error('Non-adjacent icon assignment exceeded its search limit; use more distinct icons or another seed.');
    }
    let next = -1;
    let candidates = [];
    for (const position of positions) {
      if (assigned[position.index] !== -1) continue;
      const available = palette.map((_, color) => color).filter((color) => allowed(position.index, color));
      if (available.length === 0) return false;
      if (next === -1 || available.length < candidates.length
        || (available.length === candidates.length && neighbors[position.index].length > neighbors[next].length)) {
        next = position.index;
        candidates = available;
      }
    }
    // Prune a quota as soon as too few eligible positions remain for that icon.
    for (let color = 0; color < palette.length; color++) {
      if (remaining[color] > positions.filter((position) => assigned[position.index] === -1 && allowed(position.index, color)).length) {
        return false;
      }
    }
    candidates.sort((a, b) => remaining[b] - remaining[a]
      || distanceFromCopies(next, b) - distanceFromCopies(next, a)
      || priorities[next][a] - priorities[next][b]);
    for (const color of candidates) {
      assigned[next] = color;
      remaining[color]--;
      if (search(count + 1)) return true;
      remaining[color]++;
      assigned[next] = -1;
    }
    return false;
  }

  if (!search(0)) {
    throw new Error(`No balanced non-adjacent arrangement exists for ${palette.length} icons with this seed.`);
  }
  return positions.map((position) => ({ ...position, icon: palette[assigned[position.index]] }));
}

/**
 * Exclusions are declared from the design, not inferred from diff pixels.
 * Glyph replacements, the replaced reference emblem/shadow, and square corners
 * are intentional differences. Surrounding card surfaces and spacing stay tested.
 */
export function intentionalDifference(x, y) {
  if (y < 12 && (x < 12 || x >= WIDTH - 12)) return true;
  if (x >= 561 && x < 719 && y >= 190 && y < 366) return true;
  return CARD_POSITIONS.some(([cx, cy]) =>
    x >= cx + 9 && x < cx + 59 && y >= cy + 9 && y < cy + 59);
}
