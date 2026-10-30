#!/usr/bin/env node
// Validates market/index.json with the official DSH plugin market index
// parser (@deepseek-ai/dsh-plugin-market-index), the same code a DSH client
// runs when it fetches an index source.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MarketIndexError, parseMarketIndex } from "@deepseek-ai/dsh-plugin-market-index";

const indexPath = join(dirname(fileURLToPath(import.meta.url)), "..", "market", "index.json");
const INDEX_URL =
  "https://raw.githubusercontent.com/agoudbg/agou-dsh-plugins/main/market/index.json";

let raw;
try {
  raw = JSON.parse(readFileSync(indexPath, "utf8"));
} catch (err) {
  console.error(`cannot read market/index.json: ${err.message}`);
  process.exit(1);
}

try {
  const index = parseMarketIndex(raw, INDEX_URL);
  const versions = index.plugins.reduce((n, p) => n + p.versions.length, 0);
  console.log(`ok: market index validates (${index.plugins.length} plugin(s), ${versions} version(s))`);
} catch (err) {
  if (err instanceof MarketIndexError) {
    console.error(`market index invalid: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
