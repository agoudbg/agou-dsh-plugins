import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { XMLSerializer } from '@xmldom/xmldom';
import { Resvg } from '@resvg/resvg-js';
import { bannerSvg, parseSvg, placeSvg } from './svg.mjs';

const source = readFileSync(new URL('../../packages/dsh-model-effort-memory/icon.svg', import.meta.url), 'utf8');
const serializer = new XMLSerializer();
const original = parseSvg(source, 'source');
const contents = Array.from(original.childNodes, node => serializer.serializeToString(node)).join('');
const translated = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="100 200 36 36"><g transform="translate(100 200)">${contents}</g></svg>`;

for (const [name, svg] of [['original', source], ['translated', translated]]) {
  test(`${name} filtered icon keeps its entire shadow inside the fitted viewport`, () => {
    const placed = parseSvg(placeSvg(svg, { x: 16, y: 16, width: 44, height: 44, prefix: name }), name);
    assert.notEqual(placed.getAttribute('overflow'), 'visible', 'Fitting must not rely on overflow.');
    assert.equal(placed.getElementsByTagName('circle').length, 3, 'Preserve the vector geometry.');
    // Reveal any paint that the fitted SVG would otherwise hide at its edges.
    placed.setAttribute('overflow', 'visible');
    const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">${serializer.serializeToString(placed)}</svg>`;
    const image = new Resvg(canvas, { font: { loadSystemFonts: false }, fitTo: { mode: 'zoom', value: 8 } }).render();
    const pixels = image.pixels;
    let outside = 0;
    let shadow = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4;
      if (pixels[offset + 3] === 0) continue;
      if (x < 16 * 8 || x >= 60 * 8 || y < 16 * 8 || y >= 60 * 8) outside++;
      if (pixels[offset] === 0 && pixels[offset + 1] === 0 && pixels[offset + 2] === 0) shadow++;
    }
    assert.equal(outside, 0, 'No part of the uncut artwork may extend past the viewport.');
    assert.ok(shadow > 0, 'The shadow must remain visible.');
  });
}

test('card faces retain their color when SVG shadow filters are ignored', () => {
  const brand = readFileSync(new URL('../../docs/assets/brand/icon.svg', import.meta.url), 'utf8');
  const svg = bannerSvg([{ x: 136, y: 14, index: 0, icon: { svg: source } }], brand);
  const options = { font: { loadSystemFonts: false }, background: '#FFFFFF' };
  const normal = new Resvg(svg, options).render();
  const root = parseSvg(svg, 'banner');
  let removed = 0;
  for (const element of Array.from(root.getElementsByTagName('*'))) {
    if (!/^url\(#card-shadow(?:-opaque)?\)$/.test(element.getAttribute('filter') ?? '')) continue;
    element.removeAttribute('filter');
    removed++;
  }
  assert.equal(removed, 2, 'Exercise both translucent and opaque card surfaces.');
  const imported = new Resvg(serializer.serializeToString(root), options).render();
  const expected = normal.pixels;
  const actual = imported.pixels;
  for (const [x, y] of [[170, 21], [170, 75], [143, 48], [197, 48], [610, 267]]) {
    const offset = (y * normal.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Math.abs(actual[offset + channel] - expected[offset + channel]) <= 1,
        `Ignoring the shadow must preserve the card face at ${x},${y}.`);
    }
  }
});
