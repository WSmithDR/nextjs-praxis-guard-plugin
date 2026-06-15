// rules/stringly-typed.mjs
// File rule (TS): un id comparado contra varios string literals -> union type / enum.
const CMP_RE = /([a-zA-Z_$][\w$.]*)\s*===?\s*['"]([^'"]+)['"]/g;

function isTsFile(p) { return /\.tsx?$/.test(String(p)); }

export default function stringlyTyped(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.typescript) || !isTsFile(filePath)) return [];
  const minLiterals = config.minLiterals ?? 2;

  const out = [];
  const lines = content.split('\n');
  // acumulador por id -> Set de literales + primera línea
  const byId = new Map();
  for (let i = 0; i < lines.length; i++) {
    let m;
    const re = new RegExp(CMP_RE.source, 'g');
    while ((m = re.exec(lines[i])) !== null) {
      const id = m[1], lit = m[2];
      const e = byId.get(id) || { lits: new Set(), line: i + 1 };
      e.lits.add(lit);
      byId.set(id, e);
    }
  }
  for (const [id, e] of byId) {
    if (e.lits.size >= minLiterals) {
      out.push({ rule: 'stringly-typed', line: e.line, severity: 'info',
        message: `"${id}" se compara contra varios strings fijos. Considerá un union type ('a' | 'b') o un enum.` });
    }
  }
  return out;
}
