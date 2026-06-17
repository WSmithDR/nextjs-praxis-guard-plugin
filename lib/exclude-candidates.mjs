// lib/exclude-candidates.mjs
// Sugiere directorios de primer nivel candidatos a excluir de la auditoría:
// dot-dirs de tooling/otros plugins, y dirs sin archivos de código (extensión en config.include).
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const KNOWN_TOOLING = new Set([
  '.todo', '.praxis-guard', '.claude', '.codex', '.github', '.vscode',
  '.opencode', '.husky', '.changeset',
]);
const OBVIOUS_CODE = new Set(['src', 'app', 'components', 'lib', 'pages']);

function dirHasCode(d, include, depth = 2) {
  let entries;
  try { entries = readdirSync(d); } catch { return false; }
  for (const name of entries) {
    const p = join(d, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isFile() && include.includes(extname(name))) return true;
    if (st.isDirectory() && depth > 0 && dirHasCode(p, include, depth - 1)) return true;
  }
  return false;
}

export function suggestExcludeDirs(dir, config = {}) {
  const include = config.include || [];
  const already = new Set((config.exclude || []).map((d) => d.replace(/\/$/, '')));
  let entries;
  try { entries = readdirSync(dir); } catch { return []; }
  const out = [];
  for (const name of entries) {
    if (already.has(name) || OBVIOUS_CODE.has(name)) continue;
    let st;
    try { st = statSync(join(dir, name)); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (KNOWN_TOOLING.has(name)) { out.push(name); continue; }
    if (include.length && !dirHasCode(join(dir, name), include)) out.push(name);
  }
  return out.sort();
}
