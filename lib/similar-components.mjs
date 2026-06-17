// lib/similar-components.mjs
// Agrupa componentes parecidos entre archivos por similitud de fingerprint (union-find).
import { readFileSync } from 'node:fs';
import { extractComponents, fingerprintComponent, similarity } from './component-fingerprint.mjs';

export function findSimilarGroups(ts, files, { threshold = 0.85, minElements = 3 } = {}) {
  const comps = [];
  for (const file of files) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    let sf;
    try { sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true); } catch { continue; }
    for (const c of extractComponents(ts, sf)) {
      const fp = fingerprintComponent(ts, c.fnNode);
      if (fp.size >= minElements) comps.push({ file, name: c.name, fp });
    }
  }

  const parent = comps.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { parent[find(i)] = find(j); };
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      if (comps[i].file === comps[j].file) continue;
      if (similarity(comps[i].fp, comps[j].fp) >= threshold) union(i, j);
    }
  }

  const byRoot = new Map();
  for (let i = 0; i < comps.length; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(i);
  }

  const groups = [];
  for (const members of byRoot.values()) {
    if (members.length < 2) continue;
    let minSim = 1;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const s = similarity(comps[members[a]].fp, comps[members[b]].fp);
        if (s < minSim) minSim = s;
      }
    }
    groups.push({
      similarity: Math.round(minSim * 100) / 100,
      components: members.map((m) => ({ file: comps[m].file, name: comps[m].name })),
    });
  }
  groups.sort((a, b) => b.similarity - a.similarity);
  return groups;
}
