// rules/folder-placement.mjs
// File rule: cada tipo de archivo en su carpeta permitida.
// El tipo se detecta con `match` (regex) contra el basename o el contenido.
import { basename } from 'node:path';
import { matchGlob } from '../lib/glob.mjs';

export default function folderPlacement(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  const arch = full.architecture || {};
  if (arch.strategy == null) return [];          // opt-in: sin estrategia no corre
  const placement = config.placement || [];
  if (placement.length === 0) return [];

  const path = String(filePath).replace(/\\/g, '/');
  const base = basename(path);
  const out = [];
  for (const entry of placement) {
    if (!entry || !entry.kind || !entry.match || !Array.isArray(entry.allowed)) continue;
    let re;
    try { re = new RegExp(entry.match); } catch { continue; }
    const applies = re.test(base) || re.test(content);
    if (!applies) continue;
    const ok = entry.allowed.some((g) => matchGlob(path, g));
    if (!ok) {
      out.push({ rule: 'folder-placement', severity: 'warn',
        message: `Archivo de tipo "${entry.kind}" fuera de lugar: debería estar en ${entry.allowed.join(' | ')}.` });
    }
  }
  return out;
}
