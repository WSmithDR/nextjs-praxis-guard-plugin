// lib/config.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULTS_PATH = join(__dirname, '..', 'config', 'defaults.json');

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}
function deepMerge(base, over) {
  if (!isObject(over)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}
function readJsonSafe(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

export function defaultProjectConfigPath(cwd = process.cwd()) {
  const candidates = [
    join(cwd, 'nextjs-praxis-guard.json'),
    join(cwd, '.config', 'nextjs-praxis-guard.json'),
    join(cwd, '.claude', 'nextjs-praxis-guard.json'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

export function loadConfig({ projectConfigPath, override } = {}) {
  const defaults = readJsonSafe(DEFAULTS_PATH);
  if (!defaults) throw new Error('praxis-guard: defaults.json missing/invalid');
  let cfg = defaults;
  if (projectConfigPath) {
    const fromFile = readJsonSafe(projectConfigPath);
    if (fromFile) cfg = deepMerge(cfg, fromFile);
  }
  if (override) cfg = deepMerge(cfg, override);
  return cfg;
}
