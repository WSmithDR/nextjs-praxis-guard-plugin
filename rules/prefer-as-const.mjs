// rules/prefer-as-const.mjs
// File rule (TS): objeto-mapa de constantes (nombre en MAYÚSCULAS/PascalCase) sin `as const`.
// Solo valores primitivos (string/number/bool). Heurística por línea de declaración.
const DECL_RE = /\bconst\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\{([^{}]*)\}\s*(as\s+const)?/;
const PRIMITIVE_VAL = /:\s*(['"][^'"]*['"]|-?\d+(\.\d+)?|true|false)\s*$/;

function isTsFile(p) { return /\.tsx?$/.test(String(p)); }

export default function preferAsConst(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.typescript) || !isTsFile(filePath)) return [];

  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = DECL_RE.exec(lines[i]);
    if (!m) continue;
    if (m[3]) continue;                        // ya tiene `as const`
    const body = m[2].trim();
    if (!body) continue;
    const entries = body.split(',').map((s) => s.trim()).filter(Boolean);
    if (entries.length === 0) continue;
    const allPrimitive = entries.every((e) => PRIMITIVE_VAL.test(e));
    if (!allPrimitive) continue;
    out.push({ rule: 'prefer-as-const', line: i + 1, severity: 'info',
      message: `Objeto de constantes "${m[1]}" sin "as const": perdés el narrowing de tipos. Agregá "as const".` });
  }
  return out;
}
