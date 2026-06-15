// rules/repeated-object-shape.mjs
// File rule (TS): mismo shape de objeto literal repetido -> extraé a interface/type.
const SHAPE_RE = /\{\s*([a-zA-Z_$][\w$]*\s*\??\s*:[^{}]+?)\}/g;

function isTsFile(p) { return /\.tsx?$/.test(String(p)); }

function normalizeShape(inner) {
  const props = inner.split(';').map((s) => s.trim()).filter(Boolean);
  if (props.length < 2) return null;
  // normaliza: nombre:tipo con espacios colapsados, ordenado por nombre de prop
  const norm = props.map((p) => p.replace(/\s+/g, ' ').replace(/\s*:\s*/, ':')).sort();
  return { key: norm.join(';'), count: norm.length };
}

export default function repeatedObjectShape(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.typescript) || !isTsFile(filePath)) return [];
  const minProps = config.minProps ?? 2;
  const minRepeats = config.minRepeats ?? 2;

  const seen = new Map();   // key -> { count, line }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let m;
    const re = new RegExp(SHAPE_RE.source, 'g');
    while ((m = re.exec(lines[i])) !== null) {
      const norm = normalizeShape(m[1]);
      if (!norm || norm.count < minProps) continue;
      const prev = seen.get(norm.key) || { count: 0, line: i + 1 };
      prev.count += 1;
      seen.set(norm.key, prev);
    }
  }
  const out = [];
  for (const [, v] of seen) {
    if (v.count >= minRepeats) {
      out.push({ rule: 'repeated-object-shape', line: v.line, severity: 'info',
        message: `Shape de objeto repetido ${v.count} veces. Extraé a una interface/type reutilizable.` });
    }
  }
  return out;
}
