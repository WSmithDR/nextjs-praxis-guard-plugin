// rules/feature-deps.mjs
// File rule: una feature solo importa la API pública de otra feature, no sus internos.
import { extractImports } from '../lib/imports.mjs';

// Devuelve { feature, rest } si `s` apunta dentro de featuresDir; si no, null.
// rest = path interno después de <feature>/ (vacío => raíz/API pública).
function featureRef(s, featuresBase) {
  const str = String(s).replace(/\\/g, '/');
  const idx = str.indexOf(featuresBase + '/');
  if (idx === -1) return null;
  const after = str.slice(idx + featuresBase.length + 1);
  const parts = after.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return { feature: parts[0], rest: parts.slice(1) };
}

export default function featureDeps(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  const arch = full.architecture || {};
  if (arch.strategy == null) return [];
  const featuresDir = (arch.featuresDir || 'src/features').replace(/\\/g, '/');
  const featuresBase = featuresDir.split('/').filter(Boolean).pop(); // 'features'
  const publicEntry = config.publicEntry || ['index.ts', 'index.tsx'];

  const self = featureRef(filePath, featuresBase);
  if (!self) return [];

  const out = [];
  for (const { source, line } of extractImports(content)) {
    const ref = featureRef(source, featuresBase);
    if (!ref || ref.feature === self.feature) continue;     // misma feature o no-feature
    const isPublic = ref.rest.length === 0 ||
      (ref.rest.length === 1 && publicEntry.includes(ref.rest[0]));
    if (!isPublic) {
      out.push({ rule: 'feature-deps', line, severity: 'warn',
        message: `La feature "${self.feature}" importa un interno de "${ref.feature}" ("${source}"). Importá su API pública.` });
    }
  }
  return out;
}
