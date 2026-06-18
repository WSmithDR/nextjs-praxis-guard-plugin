// rules/inline-mapped-component.mjs
// Sugiere extraer un componente cuando un `.map()` renderiza un bloque JSX no trivial inline.
// Un .map con estructura JSX grande adentro mezcla iteración + markup + (a veces) lógica;
// extraer `<Item/>` lo hace testeable y reusable.
//
// Heurística determinista: por cada `.map(`, escanea el callback balanceando paréntesis y
// cuenta los tags JSX que ABRE; si son >= minTags, lo marca. No usa regex frágil para el span.
// ponytail: el balanceo no ignora paréntesis dentro de strings ("(" sueltos) — caso raro en JSX
// mapeado; si molesta, parsear con TS (AST, --deep).
const OPEN_TAG = /<[A-Za-z][\w.]*/g;

function callbackSpan(content, openParenIdx) {
  let depth = 0;
  for (let i = openParenIdx; i < content.length; i++) {
    const c = content[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return content.slice(openParenIdx, i + 1); }
  }
  return null;  // sin cierre (archivo truncado) -> no marcamos
}

export default function inlineMappedComponent(content, filePath = '', config = {}) {
  if (config.enabled === false) return [];
  if (!/\.(tsx|jsx)$/.test(String(filePath))) return [];
  const minTags = config.minTags ?? 3;
  const out = [];
  const lineOf = (idx) => content.slice(0, idx).split('\n').length;

  const re = /\.map\s*\(/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const parenIdx = m.index + m[0].length - 1;   // el '(' que abre los args de .map(
    const span = callbackSpan(content, parenIdx);
    if (!span || !/=>/.test(span)) continue;       // debe ser un callback arrow
    const tags = (span.match(OPEN_TAG) || []).length;
    if (tags < minTags) continue;                  // bloque chico: ya es un solo elemento / trivial
    out.push({ rule: 'inline-mapped-component', line: lineOf(m.index), severity: 'info',
      message: `Bloque JSX mapeado con ${tags} elementos inline. Extraé un componente (ej. <Item/>) y mapealo: items.map((it) => <Item key={…} {...it} />).` });
  }
  return out;
}
