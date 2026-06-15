// lib/imports.mjs
// Extrae sources de import/export-from/require. Mismo regex base que forbidden-imports.
const IMPORT_RE = /^\s*(?:import\b[^'"]*|export\b[^'"]*from\s*|.*\brequire\s*\()\s*['"]([^'"]+)['"]/;

export function extractImports(content) {
  const out = [];
  const lines = String(content).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = IMPORT_RE.exec(lines[i]);
    if (m) out.push({ source: m[1], line: i + 1 });
  }
  return out;
}
