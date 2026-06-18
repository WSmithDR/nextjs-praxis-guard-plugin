// rules/file-responsibility.mjs
// Híbrido (enfoque A): el script marca la señal; el agente del loop juzga la separación.
// Thresholds por glob via `overrides:[{glob, maxLines?, mixedSignalsLines?}]` — componentes,
// utils y rutas API toleran tamaños distintos. Último override que matchea gana.
import { matchGlob } from '../lib/glob.mjs';

const FETCH_SIGNAL = /\b(fetch\(|axios|useQuery|useSWR|\.from\(|createClient\()/;
const JSX_SIGNAL = /return\s*\(?\s*</;

function resolveThresholds(filePath, config) {
  let maxLines = config.maxLines ?? 400;
  let mixedAt = config.mixedSignalsLines ?? 200;
  const path = String(filePath).replace(/\\/g, '/');
  for (const o of config.overrides || []) {
    if (!o || !o.glob || !matchGlob(path, o.glob)) continue;
    if (o.maxLines != null) maxLines = o.maxLines;
    if (o.mixedSignalsLines != null) mixedAt = o.mixedSignalsLines;
  }
  return { maxLines, mixedAt };
}

export default function fileResponsibility(content, filePath = '', config = {}) {
  if (config.enabled === false) return [];
  const { maxLines, mixedAt } = resolveThresholds(filePath, config);
  const lineCount = content.split('\n').length;
  const out = [];

  if (lineCount >= maxLines) {
    out.push({ rule: 'file-responsibility', severity: 'info',
      message: `${lineCount} líneas (umbral ${maxLines}). Evaluá separar responsabilidades en módulos más chicos.` });
  }
  if (lineCount >= mixedAt && FETCH_SIGNAL.test(content) && JSX_SIGNAL.test(content)) {
    out.push({ rule: 'file-responsibility', severity: 'info',
      message: `Mezcla fetching de datos + JSX + lógica en un archivo de ${lineCount} líneas. ¿Conviene separar responsabilidades (data layer / presentación)? Reflexioná antes de seguir.` });
  }
  return out;
}
