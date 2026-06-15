// rules/server-client-boundaries.mjs
// File rule: un client component no debe importar módulos server-only.
import { extractImports } from '../lib/imports.mjs';

const USE_CLIENT = /^\s*['"]use client['"]\s*;?\s*$/;

function isClientComponent(content) {
  for (const line of String(content).split('\n')) {
    if (line.trim() === '') continue;
    if (USE_CLIENT.test(line)) return true;
    if (line.trim().startsWith('//') || line.trim().startsWith('/*')) continue;
    break; // la directiva debe ir arriba de todo (después de comentarios)
  }
  return false;
}

export default function serverClientBoundaries(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if ((full.architecture || {}).strategy == null) return [];
  if (!isClientComponent(content)) return [];
  const serverOnly = config.serverOnly || [];
  const out = [];
  for (const { source, line } of extractImports(content)) {
    const banned = serverOnly.some((m) => source === m || source.startsWith(m + '/')) || source.startsWith('node:');
    if (banned) {
      out.push({ rule: 'server-client-boundaries', line, severity: 'warn',
        message: `Client component importa módulo server-only "${source}". Movélo a un server component o a un boundary.` });
    }
  }
  return out;
}
