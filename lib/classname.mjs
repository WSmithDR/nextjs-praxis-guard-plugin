// lib/classname.mjs
// Extrae el contenido de className="..." y className={'...'} (string literal directo).
// No resuelve concatenaciones complejas; devuelve los string literals encontrados.
const ATTR_RE = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'))/g;

export function extractClassNames(content) {
  const out = [];
  const lines = String(content).split('\n');
  for (let i = 0; i < lines.length; i++) {
    let m;
    const re = new RegExp(ATTR_RE.source, 'g');
    while ((m = re.exec(lines[i])) !== null) {
      const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
      out.push({ value, line: i + 1 });
    }
  }
  return out;
}
