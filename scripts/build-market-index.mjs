#!/usr/bin/env node
// Generates market/index.json, a DSH plugin market index (format 1), from
// package manifests, locale files, icons, git history, and the npm publish
// record in market/published.json. Stdlib only, so it runs without an
// installed node_modules.
//
// Version entries are derived from git history: every commit where a
// package's version string changed records that version, its introducing
// commit, the commit's timestamp, and the engines range declared at that
// commit. Versions listed in market/published.json (written by the publish
// script after a real npm publish) are emitted with an npm source instead
// of the git source, keeping their real publish timestamps.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = join(root, "market", "index.json");
const publishedPath = join(root, "market", "published.json");

const INDEX_URL =
  "https://raw.githubusercontent.com/agoudbg/agou-dsh-plugins/main/market/index.json";
const INDEX_TITLE = { en: "agou DSH plugins", zh: "agou 的 DSH 插件" };
const INDEX_DESCRIPTION = {
  en: "DSH (DeepSeek Harness) plugins by agoudbg.",
  zh: "agoudbg 制作的 DeepSeek Harness（DSH）插件。",
};

function git(args) {
  const res = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(res.stderr || "").trim()}`);
  }
  return res.stdout.trim();
}

function repoHttpsUrl() {
  const remote = git(["remote", "get-url", "origin"]);
  let m = /^git@github\.com:(.+?)(?:\.git)?$/.exec(remote);
  if (m) return `https://github.com/${m[1]}`;
  m = /^https:\/\/github\.com\/(.+?)(?:\.git)?$/.exec(remote);
  if (m) return `https://github.com/${m[1]}`;
  throw new Error(`cannot normalize origin remote URL: ${remote}`);
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v);
  if (!m) throw new Error(`not a valid semver version: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split(".") : [] };
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (const key of ["major", "minor", "patch"]) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1;
  }
  if (!pa.pre.length && !pb.pre.length) return 0;
  if (!pa.pre.length) return 1;
  if (!pb.pre.length) return -1;
  const n = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < n; i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === y) continue;
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) return +x < +y ? -1 : 1;
    if (xNum) return -1;
    if (yNum) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

// Maps each version string of one package to the newest commit where the
// version became current (handles bump-revert-rebump), with that commit's
// timestamp and the engines range declared at it.
function versionHistory(relManifest) {
  const log = git(["log", "--reverse", "--format=%H%x1f%cI", "--", relManifest]);
  const commits = log
    ? log.split("\n").map((line) => {
        const [sha, iso] = line.split("\x1f");
        return { sha, iso };
      })
    : [];
  const seen = new Map();
  let prev = null;
  for (const { sha, iso } of commits) {
    let manifest;
    try {
      const out = spawnSync("git", ["show", `${sha}:${relManifest}`], { cwd: root, encoding: "utf8" });
      if (out.status !== 0) continue;
      manifest = JSON.parse(out.stdout);
    } catch {
      continue;
    }
    const version = manifest.version;
    if (typeof version === "string" && version !== prev) {
      seen.set(version, { sha, iso, engines: manifest.engines?.dsh });
    }
    prev = typeof version === "string" ? version : null;
  }
  return seen;
}

function localizedMeta(pkgDir) {
  const readLocale = (lang) =>
    JSON.parse(readFileSync(join(pkgDir, "locale", `${lang}.json`), "utf8")).meta;
  const en = readLocale("en");
  const zh = readLocale("zh");
  if (!en?.title || !en?.description || !zh?.title || !zh?.description) {
    throw new Error(`locale meta.title/meta.description missing in ${pkgDir}`);
  }
  return {
    title: { en: en.title, zh: zh.title },
    description: { en: en.description, zh: zh.description },
  };
}

function iconDataUrl(pkgDir) {
  const svg = readFileSync(join(pkgDir, "icon.svg"));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}

function readPublishRecord() {
  if (!existsSync(publishedPath)) return [];
  const parsed = JSON.parse(readFileSync(publishedPath, "utf8"));
  if (!Array.isArray(parsed.records)) {
    throw new Error("market/published.json must be { \"records\": [...] }");
  }
  return parsed.records;
}

function sortedPackageDirs(dir) {
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
}

export async function buildMarketIndex() {
  const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const repoUrl = repoHttpsUrl();
  const published = readPublishRecord();

  const packagesRoot = join(root, "packages");
  const dirs = sortedPackageDirs(packagesRoot);
  const plugins = dirs.map((dir) => {
    const pkgDir = join(packagesRoot, dir);
    const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    const relManifest = `packages/${dir}/package.json`;
    const history = versionHistory(relManifest);
    if (!history.has(manifest.version)) {
      throw new Error(
        `${manifest.name}: current version ${manifest.version} has no introducing commit in git history`,
      );
    }
    const publishedByKey = new Map(published.map((r) => [`${r.name}@${r.version}`, r]));
    const versions = [...history.keys()].map((version) => {
      const { sha, iso, engines } = history.get(version);
      const npmRecord = publishedByKey.get(`${manifest.name}@${version}`);
      const entry = {
        version,
        publishTimestamp: npmRecord
          ? npmRecord.publishTimestamp
          : Math.floor(new Date(iso).getTime() / 1000),
        source: npmRecord ? { type: "npm" } : { type: "git", url: repoUrl, commit: sha, path: `packages/${dir}` },
        ...(engines ? { engines: { dsh: engines } } : {}),
      };
      return entry;
    });
    versions.sort((a, b) => compareSemver(b.version, a.version));
    for (const record of published) {
      if (record.name === manifest.name && !history.has(record.version)) {
        throw new Error(
          `market/published.json lists ${record.name}@${record.version}, which is absent from git history`,
        );
      }
    }
    return {
      name: manifest.name,
      ...localizedMeta(pkgDir),
      icon: iconDataUrl(pkgDir),
      author: rootManifest.author,
      homepage: `${repoUrl}#readme`,
      repository: { url: repoUrl, directory: `packages/${dir}` },
      metadata: { keywords: manifest.keywords ?? [], labels: [], sortKeys: {} },
      versions,
    };
  });

  const index = {
    format: 1,
    title: INDEX_TITLE,
    description: INDEX_DESCRIPTION,
    metadata: { categories: {}, labels: {}, sortKeys: {} },
    plugins,
  };
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return {
    url: INDEX_URL,
    path: indexPath,
    plugins: plugins.map((p) => ({ name: p.name, versions: p.versions.map((v) => v.version) })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildMarketIndex()
    .then((summary) => {
      for (const p of summary.plugins) {
        console.log(`ok: ${p.name} -> ${p.versions.join(", ")}`);
      }
      console.log(`wrote ${summary.path}`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
