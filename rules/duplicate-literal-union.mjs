// rules/duplicate-literal-union.mjs
// File rule (TS): la misma union de literales escrita varias veces -> nombrala.
// Captura secuencias 'lit' | 'lit' | ... (>=2 miembros string).
const UNION_RE = /(['"][^'"]+['"](?:\s*\|\s*['"][^'"]+['"])+)/g;

function isTsFile(p) { return /\.tsx?$/.test(String(p)); }

function normalizeUnion(text) {
  const members = text.split('|').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const uniq = [...new Set(members)].sort();
  return { key: uniq.join('|'), count: uniq.length };
}

export default function duplicateLiteralUnion(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.typescript) || !isTsFile(filePath)) return [];
  const minMembers = config.minMembers ?? 2;
  const minRepeats = config.minRepeats ?? 2;

  const seen = new Map();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let m;
    const re = new RegExp(UNION_RE.source, 'g');
    while ((m = re.exec(lines[i])) !== null) {
      const norm = normalizeUnion(m[1]);
      if (norm.count < minMembers) continue;
      const prev = seen.get(norm.key) || { count: 0, line: i + 1 };
      prev.count += 1;
      seen.set(norm.key, prev);
    }
  }
  const out = [];
  for (const [, v] of seen) {
    if (v.count >= minRepeats) {
      out.push({ rule: 'duplicate-literal-union', line: v.line, severity: 'info',
        message: `Union de literales repetida. Declarala una vez como type y reusala.` });
    }
  }
  return out;
}
