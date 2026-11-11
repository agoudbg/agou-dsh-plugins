#!/usr/bin/env node
/**
 * Generates the DSH detail document of every package from its README.
 *
 * The DSH plugin page renders the file named by a locale's `meta.detail` and omits raw HTML, so
 * each package keeps a headerless copy of its README beside it: DETAIL.md from README.md and
 * DETAIL-zh-CN.md from README-zh-CN.md. Both hold only the README body under its header, because
 * the page already shows the bundle's icon, name, and description. Run after editing a README:
 *
 *   node scripts/build-plugin-details.mjs
 *
 * Zero dependencies; scripts/check-packages.mjs fails when a generated copy is stale.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The README a detail document is generated from, and the file generated from it. */
export const DETAIL_SOURCES = Object.freeze([
  { readme: 'README.md', detail: 'DETAIL.md' },
  { readme: 'README-zh-CN.md', detail: 'DETAIL-zh-CN.md' },
]);

/** The readme header shape: what each of its six lines must be. */
const HEADER_SHAPE = Object.freeze([
  ['an h1 title line', /^# \S/u],
  ['a blank line', /^$/u],
  ['a <sup> language-switch line', /^<sup>.*<\/sup>$/u],
  ['a blank line', /^$/u],
  ['a one-line description', /^(?!#)\S.*$/u],
  ['a blank line', /^$/u],
]);

/**
 * The body of a README under its header: the h1 title line, the `<sup>` language-switch line, and
 * the one-line description, each separated by one blank line.
 * @param {string} markdown - the README text.
 * @param {string} label - the README path used in failure messages.
 * @returns {string} the body text with a single trailing newline.
 * @throws when the header does not have the exact shape of {@link HEADER_SHAPE}.
 */
export function detailBody(markdown, label) {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');
  for (const [index, [what, pattern]] of HEADER_SHAPE.entries()) {
    if (!pattern.test(lines[index] ?? '')) {
      throw new Error(`${label}: line ${index + 1} must be ${what}`);
    }
  }
  const body = lines.slice(HEADER_SHAPE.length).join('\n').replace(/\n+$/u, '');
  if (body === '') throw new Error(`${label}: no body under the header`);
  return `${body}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const packagesDir = path.join(root, 'packages');
  let written = 0;
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(packagesDir, entry.name);
    if (!existsSync(path.join(packageDir, 'package.json'))) continue;
    for (const { readme, detail } of DETAIL_SOURCES) {
      const relative = path.posix.join(entry.name, readme);
      const body = detailBody(readFileSync(path.join(packageDir, readme), 'utf8'), relative);
      const detailPath = path.join(packageDir, detail);
      if (existsSync(detailPath) && readFileSync(detailPath, 'utf8') === body) {
        console.log(`  ok: ${path.posix.join(entry.name, detail)}`);
      } else {
        writeFileSync(detailPath, body);
        console.log(`  wrote: ${path.posix.join(entry.name, detail)}`);
        written += 1;
      }
    }
  }
  console.log(`\n${written} detail document(s) written.`);
}
