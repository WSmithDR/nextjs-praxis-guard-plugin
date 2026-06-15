// rules/layer-boundaries.mjs
// File rule: dirección de imports permitida entre capas (por path).
import { extractImports } from '../lib/imports.mjs';

// ¿La capa `layer` aparece como segmento en `s`? Reconoce por path o por name.
function hits(s, layer) {
  const str = String(s).replace(/\\/g, '/');
  const needles = [layer.path, layer.name].filter(Boolean).map((x) => String(x).replace(/\\/g, '/'));
  return needles.some((n) =>
    str === n || str.startsWith(n + '/') || str.endsWith('/' + n) || str.includes('/' + n + '/'));
}
function layerOf(s, layers) {
  return layers.find((l) => hits(s, l)) || null;
}

export default function layerBoundaries(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if ((full.architecture || {}).strategy == null) return [];
  const layers = config.layers || [];
  if (layers.length === 0) return [];

  const fileLayer = layerOf(filePath, layers);
  if (!fileLayer) return [];

  const out = [];
  for (const { source, line } of extractImports(content)) {
    const target = layerOf(source, layers);
    if (!target || target.name === fileLayer.name) continue;
    if (!(fileLayer.mayImport || []).includes(target.name)) {
      out.push({ rule: 'layer-boundaries', line, severity: 'warn',
        message: `La capa "${fileLayer.name}" no puede importar de "${target.name}" (import "${source}").` });
    }
  }
  return out;
}
