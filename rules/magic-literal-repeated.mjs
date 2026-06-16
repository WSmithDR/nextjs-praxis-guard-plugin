// rules/magic-literal-repeated.mjs
// Project rule (regex, sin AST): un literal (string >= minLen, o número >= 3 dígitos)
// repetido en >= minFiles archivos distintos -> sugerir extraerlo a una const.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const meta = { kind: 'project' };

const SRC_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

export default function magicLiteralRepeated(tree, full = {}) {
  const cfg = (full.rules && full.rules['magic-literal-repeated']) || {};
  if (cfg.enabled === false) return [];
  const minFiles = cfg.minFiles ?? 3;
  const minLen = cfg.minLen ?? 4;
  const root = tree && tree.root;
  if (!root) return [];

  const files = (tree.files || []).filter((f) => SRC_RE.test(f));
  const occ = new Map();   // literal -> Map<file, firstLine>
  for (const rel of files) {
    let text;
    try { text = readFileSync(join(root, rel), 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const lit of literalsIn(lines[i], minLen)) {
        if (!occ.has(lit)) occ.set(lit, new Map());
        const m = occ.get(lit);
        if (!m.has(rel)) m.set(rel, i + 1);
      }
    }
  }

  const out = [];
  for (const [lit, m] of occ) {
    if (m.size >= minFiles) {
      const [firstFile, firstLine] = [...m.entries()][0];
      out.push({
        rule: 'magic-literal-repeated', severity: 'info', file: firstFile, line: firstLine,
        message: `El literal ${lit} aparece en ${m.size} archivos. Considerá extraerlo a una constante compartida.`,
      });
    }
  }
  return out;
}

// literales de una línea: strings con comillas (>= minLen) y números (>= 3 dígitos).
function literalsIn(line, minLen) {
  const out = [];
  // Match single-quoted, double-quoted, or backtick-quoted strings with >= minLen inner chars.
  // Built without embedding a backtick inside a template literal to avoid syntax errors.
  const q = "(['\"`])";
  const inner = '(?:[^\'"\\`\\\\]|\\\\.){' + minLen + ',}';
  const strRe = new RegExp(q + '(' + inner + ')' + '\\1', 'g');
  let m;
  while ((m = strRe.exec(line)) !== null) out.push(`${m[1]}${m[2]}${m[1]}`);
  const numRe = /(?<![\w.])\d{3,}(?![\w.])/g;
  while ((m = numRe.exec(line)) !== null) out.push(m[0]);
  return out;
}
