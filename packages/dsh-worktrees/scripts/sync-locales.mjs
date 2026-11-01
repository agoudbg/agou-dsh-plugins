import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const languages = ['en', 'zh'];
const beginMarker = '    // BEGIN GENERATED COPY: edit locale/*.json, then run pnpm locales.';
const endMarker = '    // END GENERATED COPY';

async function readDictionary(language) {
  const name = `locale/${language}.json`;
  let resource;
  try { resource = JSON.parse(await readFile(new URL(name, root), 'utf8')); }
  catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }); }
  const dictionary = resource?.ui;
  if (!dictionary || typeof dictionary !== 'object' || Array.isArray(dictionary) || Object.keys(dictionary).length === 0) {
    throw new Error(`${name}: ui must be a non-empty flat string dictionary.`);
  }
  for (const [key, value] of Object.entries(dictionary)) {
    if (!key || typeof value !== 'string') throw new Error(`${name}: ui.${key || '(empty key)'} must be a string with a non-empty key.`);
  }
  return dictionary;
}

function validateParity(copy) {
  const reference = languages[0];
  const keys = Object.keys(copy[reference]).sort();
  const placeholders = text => [...text.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort();
  for (const language of languages.slice(1)) {
    const otherKeys = Object.keys(copy[language]).sort();
    if (JSON.stringify(keys) !== JSON.stringify(otherKeys)) {
      const missing = keys.filter(key => !Object.hasOwn(copy[language], key));
      const extra = otherKeys.filter(key => !Object.hasOwn(copy[reference], key));
      throw new Error(`locale/${language}.json: ui keys differ from ${reference}; missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)}.`);
    }
    for (const key of keys) {
      if (JSON.stringify(placeholders(copy[reference][key])) !== JSON.stringify(placeholders(copy[language][key]))) {
        throw new Error(`locale/${language}.json: ui.${key} placeholders differ from ${reference}.`);
      }
    }
  }
  return keys.length;
}

function uniqueMarker(source, marker) {
  const index = source.indexOf(marker);
  if (index < 0 || source.indexOf(marker, index + marker.length) !== -1) {
    throw new Error(`client.js must contain exactly one ${marker.trim()} marker.`);
  }
  return index;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length === 1 && args[0] !== '--check') {
    throw new Error('Usage: node scripts/sync-locales.mjs [--check]');
  }
  const copy = Object.fromEntries(await Promise.all(languages.map(async language => [language, await readDictionary(language)])));
  const count = validateParity(copy);
  const clientFile = new URL('client.js', root);
  const source = await readFile(clientFile, 'utf8');
  const begin = uniqueMarker(source, beginMarker);
  const end = uniqueMarker(source, endMarker);
  if (end <= begin) throw new Error('client.js generated COPY markers are out of order.');
  const declaration = `const COPY = ${JSON.stringify(copy, null, 2)};`;
  const block = [beginMarker, ...declaration.split('\n').map(line => `    ${line}`), endMarker].join('\n');
  const generated = source.slice(0, begin) + block + source.slice(end + endMarker.length);
  if (generated !== source) {
    if (args[0] === '--check') throw new Error('client.js COPY is out of date. Run pnpm locales to synchronize the locale resources.');
    await writeFile(clientFile, generated, 'utf8');
    console.log(`Synchronized client.js COPY (${count} keys per locale: ${languages.join(', ')}).`);
  } else {
    console.log(`Client locales are current (${count} keys per locale: ${languages.join(', ')}).`);
  }
}

main().catch(error => {
  console.error(`sync-locales: ${error.message}`);
  process.exitCode = 1;
});
