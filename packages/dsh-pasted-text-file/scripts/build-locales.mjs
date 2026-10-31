import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const output = new URL('client.locales.js', root);
const check = process.argv[2] === '--check';

try {
  if (process.argv.length > 3 || (process.argv[2] !== undefined && !check)) {
    throw new Error('Usage: node scripts/build-locales.mjs [--check]');
  }
  const dictionaries = {};
  for (const locale of ['en', 'zh']) {
    const file = new URL(`locale/${locale}.json`, root);
    let document;
    try {
      document = JSON.parse(readFileSync(file, 'utf8'));
    } catch (cause) {
      throw new Error(`Cannot read locale/${locale}.json`, { cause });
    }
    if (document === null || typeof document !== 'object' || Array.isArray(document)) {
      throw new Error(`locale/${locale}.json must contain an object`);
    }
    const { meta, ...dictionary } = document;
    if (Object.values(dictionary).some((value) => typeof value !== 'string')) {
      throw new Error(`Runtime entries in locale/${locale}.json must be strings`);
    }
    dictionaries[locale] = dictionary;
  }
  if (JSON.stringify(Object.keys(dictionaries.en).sort()) !== JSON.stringify(Object.keys(dictionaries.zh).sort())) {
    throw new Error('Runtime locale keys must match between locale/en.json and locale/zh.json');
  }

  const source = `// Generated from locale/*.json by scripts/build-locales.mjs. Do not edit.\nwindow.__ModuleLoader__.load({\n  id: 'dsh-pasted-text-file',\n  chunk: 'client.locales.js',\n  factory() {\n    return ${JSON.stringify(dictionaries, null, 2).replaceAll('\n', '\n    ')};\n  },\n});\n`;
  const current = existsSync(output) ? readFileSync(output, 'utf8') : undefined;
  if (check) {
    if (current !== source) throw new Error('Generated locale resource is stale. Run pnpm run build.');
  } else if (current !== source) {
    writeFileSync(output, source);
    // DSH versions sibling chunks by the entry artifact's filesystem generation.
    const now = new Date();
    utimesSync(new URL('client.js', root), now, now);
  }
} catch (failure) {
  console.error('[dsh-pasted-text-file] Could not build locale resources:', failure);
  process.exitCode = 1;
}
