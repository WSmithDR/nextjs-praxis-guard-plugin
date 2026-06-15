// lib/walk.mjs
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isInScope } from './scope.mjs';

export function enumerateFiles(root, config = {}) {
  const exclude = (config.exclude || []).map((d) => d.replace(/\/$/, ''));
  const out = [];
  (function walk(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const name of entries) {
      const p = join(d, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) {
        if (!exclude.includes(name)) walk(p);
      } else {
        const rel = relative(root, p).replace(/\\/g, '/');
        if (isInScope(rel, config)) out.push(rel);
      }
    }
  })(root);
  return out.sort();
}

export function buildProjectTree(files) {
  const dirs = new Set();
  for (const f of files) {
    const parts = f.split('/');
    parts.pop();
    let acc = '';
    for (const p of parts) { acc = acc ? acc + '/' + p : p; dirs.add(acc); }
  }
  return { files, dirs };
}
