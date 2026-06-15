// lib/meta.mjs
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function metaPath(dir) { return join(dir, '.praxis-guard', 'meta.json'); }

export function readMeta(dir) {
  try { return JSON.parse(readFileSync(metaPath(dir), 'utf8')); }
  catch { return {}; }
}

export function writeMeta(dir, patch) {
  const next = { ...readMeta(dir), ...patch };
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  const p = metaPath(dir);
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  renameSync(tmp, p);
  return next;
}
