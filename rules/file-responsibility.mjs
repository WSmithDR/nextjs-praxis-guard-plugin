// rules/file-responsibility.mjs
// Híbrido (enfoque A): el script marca la señal; el agente del loop juzga la separación.
const FETCH_SIGNAL = /\b(fetch\(|axios|useQuery|useSWR|\.from\(|createClient\()/;
const JSX_SIGNAL = /return\s*\(?\s*</;

export default function fileResponsibility(content, _filePath, config = {}) {
  if (config.enabled === false) return [];
  const maxLines = config.maxLines ?? 400;
  const mixedAt = config.mixedSignalsLines ?? 200;
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
