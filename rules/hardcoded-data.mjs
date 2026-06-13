// rules/hardcoded-data.mjs
// Flags large string-literal arrays embedded in React component files (.tsx/.jsx).
const STRING_ELEM = /(['"`])(?:\\.|(?!\1).)*\1/g;

export default function hardcodedData(content, filePath, config = {}) {
  if (config.enabled === false) return [];
  if (!/\.(tsx|jsx)$/.test(filePath)) return [];
  const min = config.minElements ?? 8;
  const out = [];
  const arrayRe = /\[([^\[\]]*)\]/g;
  let m;
  while ((m = arrayRe.exec(content)) !== null) {
    const inner = m[1];
    const strings = inner.match(STRING_ELEM);
    if (strings && strings.length >= min) {
      const line = content.slice(0, m.index).split('\n').length;
      out.push({ rule: 'hardcoded-data', line, severity: 'warn',
        message: `Array literal de ${strings.length} strings de dominio en un componente. Extraé a config/, una constante en /lib o la DB.` });
    }
  }
  return out;
}
