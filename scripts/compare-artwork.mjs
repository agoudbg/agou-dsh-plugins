#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { Resvg } from '@resvg/resvg-js';
import { WIDTH, HEIGHT, intentionalDifference } from './artwork/layout.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  reference: { type: 'string' },
  actual: { type: 'string', default: path.join(root, 'docs/assets/brand/banner.png') },
  output: { type: 'string', default: path.join(root, '.tmp/artwork/qa') },
  help: { type: 'boolean', short: 'h', default: false },
} });

if (values.help) {
  console.log('Usage: node scripts/compare-artwork.mjs --reference PNG [--actual PNG] [--output DIRECTORY]');
} else {
  if (!values.reference) {
    throw new Error('Provide --reference PATH to a local 1280 × 440 PNG. Reference images are not included in the repository.');
  }
  const normalizedPath = (file) => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
  const inputs = new Set([values.reference, values.actual].map(normalizedPath));
  for (const name of ['diff-full.png', 'diff-structure.png', 'intentional-changes.png', 'comparison.png', 'report.json']) {
    if (inputs.has(normalizedPath(path.join(values.output, name)))) {
      throw new Error(`Output ${name} would overwrite an input image; choose another output directory.`);
    }
  }
  const [referenceBytes, actualBytes] = await Promise.all([readFile(values.reference), readFile(values.actual)]);
  const reference = PNG.sync.read(referenceBytes);
  const actual = PNG.sync.read(actualBytes);
  for (const [label, image] of [['reference', reference], ['actual', actual]]) {
    if (image.width !== WIDTH || image.height !== HEIGHT) throw new Error(`${label} must be ${WIDTH} × ${HEIGHT}.`);
  }
  const pixels = WIDTH * HEIGHT;
  const mask = new Uint8Array(pixels);
  const fullMask = new Uint8Array(pixels);
  const maskImage = new PNG({ width: WIDTH, height: HEIGHT });
  let excluded = 0;
  let compared = 0;
  let visible = 0;
  let alphaError = 0;
  let colorError = 0;
  for (let i = 0; i < pixels; i++) {
    const x = i % WIDTH;
    const y = Math.floor(i / WIDTH);
    const offset = i * 4;
    const intentional = intentionalDifference(x, y);
    const transparent = reference.data[offset + 3] === 0 && actual.data[offset + 3] === 0;
    fullMask[i] = transparent ? 1 : 0;
    mask[i] = intentional || transparent ? 1 : 0;
    if (!transparent) visible++;
    if (intentional) excluded++;
    if (!mask[i]) {
      compared++;
      const ra = reference.data[offset + 3] / 255;
      const aa = actual.data[offset + 3] / 255;
      alphaError += Math.abs(reference.data[offset + 3] - actual.data[offset + 3]);
      for (let channel = 0; channel < 3; channel++) {
        // Premultiplication measures visible error and ignores invisible RGB noise.
        colorError += Math.abs(reference.data[offset + channel] * ra - actual.data[offset + channel] * aa);
      }
    }
    maskImage.data.set(intentional ? [211, 67, 173, 170] : [0, 0, 0, 0], offset);
  }
  const diff = new PNG({ width: WIDTH, height: HEIGHT });
  const structuralDiff = new PNG({ width: WIDTH, height: HEIGHT });
  // Fixed before calibration. Include edge antialiasing; compare alpha on a checkerboard.
  const options = { threshold: 0.05, includeAA: true, checkerboard: true };
  const fullDifference = pixelmatch(reference.data, actual.data, diff.data, WIDTH, HEIGHT, { ...options, ignoreMask: fullMask });
  const structuralDifference = pixelmatch(reference.data, actual.data, structuralDiff.data, WIDTH, HEIGHT, { ...options, ignoreMask: mask });
  const strictDifference = pixelmatch(reference.data, actual.data, null, WIDTH, HEIGHT, { ...options, threshold: 0.01, ignoreMask: mask });
  await mkdir(values.output, { recursive: true });
  const diffBytes = PNG.sync.write(diff);
  const structuralBytes = PNG.sync.write(structuralDiff);
  await Promise.all([
    writeFile(path.join(values.output, 'diff-full.png'), diffBytes),
    writeFile(path.join(values.output, 'diff-structure.png'), structuralBytes),
    writeFile(path.join(values.output, 'intentional-changes.png'), PNG.sync.write(maskImage)),
  ]);
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const report = {
    canvas: { width: WIDTH, height: HEIGHT },
    referenceSha256: hash(referenceBytes),
    actualSha256: hash(actualBytes),
    method: { tool: 'pixelmatch 8.0.0', ...options, strictThreshold: 0.01 },
    exclusions: '50 × 50 px glyph regions in each card; the replaced central reference emblem and its original shadow; requested square top corners. Magenta in intentional-changes.png. Fully transparent pixels in both images do not count toward agreement.',
    fullImage: { comparedPixels: visible, changedPixels: fullDifference, changedPercent: fullDifference / visible * 100 },
    structure: {
      excludedDesignPixels: excluded,
      comparedPixels: compared,
      changedPixels: structuralDifference,
      changedPercent: structuralDifference / compared * 100,
      strictChangedPixels: strictDifference,
      strictChangedPercent: strictDifference / compared * 100,
      meanPremultipliedRgbError: colorError / (compared * 3),
      meanAlphaError: alphaError / compared,
    },
    scope: 'A reconstruction of this reference, calibrated against the same image. Structural agreement does not measure the replacement icons or establish exact pixel identity.',
  };
  await writeFile(path.join(values.output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const sections = [
    ['REFERENCE — supplied PowerToys artwork', referenceBytes],
    ['GENERATED — Agou DSH Plugins', actualBytes],
    ['STRUCTURAL DIFF — red marks differences; see magenta exclusion mask separately', structuralBytes],
  ];
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1416" viewBox="0 0 1280 1416">
    <rect width="1280" height="1416" fill="#FFFFFF" />
    ${sections.map(([label, bytes], index) => `<text x="16" y="${index * 472 + 23}" font-family="Arial, sans-serif" font-size="16" fill="#273B50">${label}</text><image x="0" y="${index * 472 + 32}" width="1280" height="440" href="data:image/png;base64,${bytes.toString('base64')}" />`).join('')}
  </svg>`;
  await writeFile(path.join(values.output, 'comparison.png'), new Resvg(sheet).render().asPng());
  console.log(JSON.stringify(report, null, 2));
}
