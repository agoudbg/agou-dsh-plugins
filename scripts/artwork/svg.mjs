import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { Resvg } from '@resvg/resvg-js';
import { WIDTH, HEIGHT, CARD_SIZE, ICON_SIZE, BRAND_BOX, BRAND_BORDER_WIDTH } from './layout.mjs';

const serializer = new XMLSerializer();
const CARD_OPACITY = 0.7;
const SHADOW_OPACITY = 0.09;

/** Parse repository SVGs as XML, with no scripts or external resources. */
export function parseSvg(source, label) {
  const document = new DOMParser({
    onError: (level, message) => { throw new Error(`${label}: ${level}: ${message}`); },
  }).parseFromString(source, 'image/svg+xml');
  const root = document.documentElement;
  if (root?.localName !== 'svg') throw new Error(`${label}: expected an SVG root.`);
  if (document.doctype) throw new Error(`${label}: document types are not supported.`);
  for (const element of [root, ...Array.from(root.getElementsByTagName('*'))]) {
    if (['script', 'foreignObject', 'image', 'style', 'text'].includes(element.localName)) {
      throw new Error(`${label}: ${element.localName} is not a self-contained vector shape.`);
    }
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) throw new Error(`${label}: event handlers are unsupported.`);
      if (attribute.localName === 'href' && !attribute.value.startsWith('#')) {
        throw new Error(`${label}: external references are unsupported.`);
      }
      for (const match of attribute.value.matchAll(/url\(([^)]+)\)/g)) {
        if (!/^['"]?#[^'"\s]+['"]?$/.test(match[1])) {
          throw new Error(`${label}: external paint references are unsupported.`);
        }
      }
    }
  }
  return root;
}

/** Measure filtered ink without rasterizing the exported SVG artwork. */
function paintedBounds(root, label) {
  const viewBox = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error(`${label}: filtered artwork requires a valid viewBox.`);
  }
  const sample = root.cloneNode(true);
  sample.setAttribute('width', String(viewBox[2]));
  sample.setAttribute('height', String(viewBox[3]));
  // Subpixel sampling captures faint shadow tails; cap the temporary raster size.
  const image = new Resvg(serializer.serializeToString(sample), {
    font: { loadSystemFonts: false },
    fitTo: { mode: 'zoom', value: Math.min(8, 1024 / Math.max(viewBox[2], viewBox[3])) },
  }).render();
  const pixels = image.pixels;
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (pixels[(y * image.width + x) * 4 + 3] === 0) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) return undefined;
  const unitX = viewBox[2] / image.width;
  const unitY = viewBox[3] / image.height;
  return {
    x: viewBox[0] + left * unitX,
    y: viewBox[1] + top * unitY,
    width: (right + 1 - left) * unitX,
    height: (bottom + 1 - top) * unitY,
  };
}

/** Namespace repeated gradients/filters so one plugin cannot repaint another. */
export function placeSvg(source, { x, y, width, height, prefix, crop = true, preserveCenter = false }) {
  const root = parseSvg(source, prefix);
  const elements = [root, ...Array.from(root.getElementsByTagName('*'))];
  const ids = new Map(elements.filter((element) => element.hasAttribute('id'))
    .map((element) => [element.getAttribute('id'), `${prefix}-${element.getAttribute('id')}`]));
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      let value = attribute.value;
      if (attribute.name === 'id') value = ids.get(value);
      else if (attribute.localName === 'href' && value.startsWith('#')) value = `#${ids.get(value.slice(1)) ?? value.slice(1)}`;
      else if (['aria-labelledby', 'aria-describedby'].includes(attribute.name)) {
        value = value.split(/\s+/).map((id) => ids.get(id) ?? id).join(' ');
      } else {
        value = value.replace(/url\(['"]?#([^)'"\s]+)['"]?\)/g,
          (_, id) => `url(#${ids.get(id) ?? id})`);
      }
      element.setAttribute(attribute.name, value);
    }
  }
  if (crop) {
    const bounds = elements.some((element) => element.localName === 'filter')
      ? paintedBounds(root, prefix)
      : new Resvg(source, { font: { loadSystemFonts: false } }).getBBox();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) throw new Error(`${prefix}: empty icon.`);
    // Keep the same glyph scale while preserving authored optical alignment.
    let centerX = bounds.x + bounds.width / 2;
    let centerY = bounds.y + bounds.height / 2;
    if (preserveCenter) {
      const viewBox = root.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
      if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
        throw new Error(`${prefix}: optical alignment requires a valid viewBox.`);
      }
      centerX = viewBox[0] + viewBox[2] / 2;
      centerY = viewBox[1] + viewBox[3] / 2;
      root.setAttribute('overflow', 'visible');
    }
    root.setAttribute('viewBox', `${centerX - (bounds.width + 0.5) / 2} ${centerY - (bounds.height + 0.5) / 2} ${bounds.width + 0.5} ${bounds.height + 0.5}`);
  }
  for (const [name, value] of Object.entries({ x, y, width, height })) root.setAttribute(name, String(value));
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return serializer.serializeToString(root);
}

/** Cards share geometry and glyph scale; the main card has an opaque surface. */
function cardSvg({ x, y, svg, prefix, main = false }) {
  // Apply opacity after filtering so discarded effects leave the white surface intact.
  return `<g id="${prefix}-card">
    <rect x="${x - 0.5}" y="${y - 0.5}" width="69" height="69" rx="15.5" fill="none" stroke="#000000" stroke-opacity="0.055" />
    <g opacity="${main ? 1 : CARD_OPACITY}">
      <rect x="${x}" y="${y}" width="${CARD_SIZE}" height="${CARD_SIZE}" rx="15" fill="#FFFFFF" filter="url(#${main ? 'card-shadow-opaque' : 'card-shadow'})" />
    </g>
    ${main ? `<rect x="${x - BRAND_BORDER_WIDTH / 2}" y="${y - BRAND_BORDER_WIDTH / 2}" width="${CARD_SIZE + BRAND_BORDER_WIDTH}" height="${CARD_SIZE + BRAND_BORDER_WIDTH}" rx="${15 + BRAND_BORDER_WIDTH / 2}" fill="none" stroke="url(#brand-border)" stroke-width="${BRAND_BORDER_WIDTH}" />` : ''}
    ${placeSvg(svg, { x: x + 12, y: y + 12, width: ICON_SIZE, height: ICON_SIZE, prefix, preserveCenter: main })}
  </g>`.replace(/[ \t]+$/gm, '');
}

export function bannerSvg(assignments, brandSvg) {
  const cards = assignments.map(({ x, y, index, icon }) =>
    cardSvg({ x, y, svg: icon.svg, prefix: `plugin-${index}` })).join('\n');
  const mainCard = cardSvg({ ...BRAND_BOX, svg: brandSvg, prefix: 'brand', main: true });
  // Let the viewBox determine height so fragment crops also resize the image box.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none" role="img" aria-labelledby="banner-title banner-description">
  <title id="banner-title">Agou DSH Plugins</title>
  <desc id="banner-description">A blue field of plugin cards with a bordered puzzle-piece card for Agou DSH Plugins.</desc>
  <defs>
    <linearGradient id="background-top" x1="0" x2="1280" gradientUnits="userSpaceOnUse">
      <stop stop-color="#8BB2CC" /><stop offset="1" stop-color="#AAC8DE" />
    </linearGradient>
    <linearGradient id="background-bottom" x1="0" x2="1280" gradientUnits="userSpaceOnUse">
      <stop stop-color="#92B4CD" /><stop offset="1" stop-color="#C8DFEE" />
    </linearGradient>
    <linearGradient id="vertical-blend" x1="0" y1="0" x2="0" y2="440" gradientUnits="userSpaceOnUse">
      <stop stop-color="#000000" /><stop offset="1" stop-color="#FFFFFF" />
    </linearGradient>
    <mask id="background-blend" x="0" y="0" width="1280" height="440" maskUnits="userSpaceOnUse">
      <rect width="1280" height="440" fill="url(#vertical-blend)" />
    </mask>
    <radialGradient id="field-fade" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(628.856 -0.45) scale(1102.932 379.452)">
      <stop offset="0.416715" stop-color="#FFFFFF" />
      <stop offset="1" stop-color="#000000" />
    </radialGradient>
    <mask id="field-mask" x="0" y="0" width="1280" height="440" maskUnits="userSpaceOnUse">
      <rect width="1280" height="440" fill="url(#field-fade)" />
    </mask>
    <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-color="#000000" flood-opacity="${SHADOW_OPACITY / CARD_OPACITY}" />
    </filter>
    <filter id="card-shadow-opaque" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-color="#000000" flood-opacity="${SHADOW_OPACITY}" />
    </filter>
    <linearGradient id="brand-border" x1="606" y1="233" x2="674" y2="301" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2AAEC7" /><stop offset="1" stop-color="#425BD5" />
    </linearGradient>
  </defs>
  <g mask="url(#field-mask)">
    <rect width="1280" height="440" fill="url(#background-top)" />
    <rect width="1280" height="440" fill="url(#background-bottom)" mask="url(#background-blend)" />
    ${cards}
  </g>
  ${mainCard}
</svg>\n`;
}
