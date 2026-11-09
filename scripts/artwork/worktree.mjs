// Parses `git status --porcelain -z` output for the artwork refresh guard.
// The -z form is NUL-delimited and machine readable: each record is
// "XY PATH", except renames and copies which append the original path as an
// extra NUL-terminated field, so splitting on NUL alone is not enough.

const RENAME_OR_COPY = new Set(['R', 'C']);

export function parsePorcelainZ(output) {
  const tokens = output.split('\0');
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const record = tokens[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    const entry = { status, path: record.slice(3) };
    if (RENAME_OR_COPY.has(status[0]) || RENAME_OR_COPY.has(status[1])) {
      index += 1;
      entry.originalPath = tokens[index];
    }
    entries.push(entry);
  }
  return entries;
}

// A rename counts on both sides: moving a file out of the directory must be
// treated as a change to it, and so must moving one in.
export function pathsOutside(entries, directory) {
  const outside = new Set();
  for (const entry of entries) {
    for (const candidate of [entry.path, entry.originalPath]) {
      if (!candidate) continue;
      const parent = candidate.includes('/') ? candidate.slice(0, candidate.lastIndexOf('/')) : '';
      if (parent !== directory) outside.add(candidate);
    }
  }
  return [...outside];
}
