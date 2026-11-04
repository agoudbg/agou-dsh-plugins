#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import { DEFAULT_SEED, assignIcons, WIDTH, HEIGHT, BRAND_BOX, BRAND_BORDER_WIDTH } from './artwork/layout.mjs';
import { bannerSvg, parseSvg } from './artwork/svg.mjs';

const { values } = parseArgs({ options: {
  root: { type: 'string', default: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') },
  output: { type: 'string' },
  seed: { type: 'string', default: DEFAULT_SEED },
  help: { type: 'boolean', short: 'h', default: false },
} });

if (values.help) {
  console.log('Usage: node scripts/generate-artwork.mjs [--seed TEXT] [--output DIRECTORY] [--root REPOSITORY]');
} else {
  const root = path.resolve(values.root);
  const output = path.resolve(values.output ?? path.join(root, 'docs/assets/brand'));
  const packages = path.join(root, 'packages');
  const directories = (await readdir(packages, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const icons = await Promise.all(directories.map(async (name) => {
    const source = path.join('packages', name, 'icon.svg');
    const svg = await readFile(path.join(root, source), 'utf8');
    parseSvg(svg, source);
    return { name, source: source.split(path.sep).join('/'), svg };
  }));
  const normalizedPath = (file) => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
  if (icons.some(({ source }) => normalizedPath(path.join(root, source)) === normalizedPath(path.join(output, 'icon.svg')))) {
    throw new Error('Output would overwrite a plugin icon; choose another output directory.');
  }
  const brand = await readFile(path.join(root, 'docs/assets/brand/icon.svg'), 'utf8');
  parseSvg(brand, 'brand icon');
  const assignments = assignIcons(icons, values.seed);
  const banner = bannerSvg(assignments, brand);
  await mkdir(output, { recursive: true });
  for (const [name, svg] of [['banner', banner], ['icon', brand]]) {
    const rendered = new Resvg(svg, { font: { loadSystemFonts: false } });
    // Keep the authored source in place, and include it in custom output bundles.
    if (name !== 'icon' || output !== path.join(root, 'docs/assets/brand')) {
      await writeFile(path.join(output, `${name}.svg`), svg);
    }
    await writeFile(path.join(output, `${name}.png`), rendered.render().asPng());
  }
  const manifest = {
    canvas: { width: WIDTH, height: HEIGHT },
    seed: values.seed,
    mainCard: { ...BRAND_BOX, source: 'docs/assets/brand/icon.svg', opacity: 1, fieldMask: false, emphasis: `${BRAND_BORDER_WIDTH}px blue-cyan border; optically centered A puzzle glyph; opaque white surface outside the field opacity mask` },
    repetition: 'Seeded balanced graph coloring. Equal icons are forbidden when horizontal separation is at most 188px and vertical separation is at most 94px, including diagonals.',
    icons: icons.map(({ name, source, svg }) => ({ name, source, sha256: createHash('sha256').update(svg).digest('hex') })),
    cards: assignments.map(({ x, y, icon }) => ({ x, y, width: 68, height: 68, plugin: icon.name })),
    counts: Object.fromEntries(icons.map(({ name }) => [name, assignments.filter(({ icon }) => icon.name === name).length])),
  };
  await writeFile(path.join(output, 'layout.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated SVG and PNG artwork in ${output}`);
  console.log(`${assignments.length} cards, ${icons.length} plugin icons; seed: ${values.seed}`);
}
