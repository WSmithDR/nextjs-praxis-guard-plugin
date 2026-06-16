// lib/baseline.mjs
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Huella de un finding: sha256(rule + file + message). NO incluye la línea
// (robusto al drift). Dos findings idénticos en un archivo colapsan en una huella.
export function findingFingerprint(f) {
  const h = createHash('sha256');
  h.update(String(f.rule) + '\0' + String(f.file) + '\0' + String(f.message));
  return 'sha256:' + h.digest('hex');
}

export function baselinePath(dir) { return join(dir, '.praxis-guard', 'baseline.json'); }

export function readBaseline(dir) {
  try {
    const obj = JSON.parse(readFileSync(baselinePath(dir), 'utf8'));
    return (obj && Array.isArray(obj.fingerprints)) ? obj : null;
  } catch { return null; }
}

export function writeBaseline(dir, fingerprints, meta = {}) {
  const obj = {
    created_at: meta.created_at || '',
    plugin_version: meta.plugin_version || '',
    fingerprints: [...fingerprints],
  };
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  const p = baselinePath(dir);
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, p);
  return obj;
}

// Parte findings en { shown, suppressed, resolvedCount }.
// resolvedCount = huellas en la baseline que NO aparecieron en `findings`.
export function applyBaseline(findings, baseline) {
  if (!baseline || !Array.isArray(baseline.fingerprints)) {
    return { shown: findings, suppressed: [], resolvedCount: 0 };
  }
  const accepted = new Set(baseline.fingerprints);
  const seen = new Set();
  const shown = [], suppressed = [];
  for (const f of findings) {
    const fp = findingFingerprint(f);
    seen.add(fp);
    if (accepted.has(fp)) suppressed.push(f);
    else shown.push(f);
  }
  let resolvedCount = 0;
  for (const fp of accepted) if (!seen.has(fp)) resolvedCount++;
  return { shown, suppressed, resolvedCount };
}
