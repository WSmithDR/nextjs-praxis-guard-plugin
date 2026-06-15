// lib/tsconfig-fix.mjs
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

// Flags del baseline que faltan o están en false en compilerOptions.
export function computeMissing(options, baseline) {
  const opts = options || {};
  return (baseline || []).filter((flag) => opts[flag] !== true);
}

// Escribe los flags faltantes en true dentro de compilerOptions. Solo para JSON limpio.
// Devuelve { written: boolean, missing: string[] }.
export function applyFix(tsconfigPath, baseline) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(tsconfigPath, 'utf8')); }
  catch { return { written: false, missing: [] }; }
  const missing = computeMissing(parsed.compilerOptions, baseline);
  if (missing.length === 0) return { written: false, missing: [] };
  parsed.compilerOptions = parsed.compilerOptions || {};
  for (const flag of missing) parsed.compilerOptions[flag] = true;
  const tmp = tsconfigPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(parsed, null, 2) + '\n');
  renameSync(tmp, tsconfigPath);
  return { written: true, missing };
}
