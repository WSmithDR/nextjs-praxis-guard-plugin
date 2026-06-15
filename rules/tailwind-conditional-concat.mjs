// rules/tailwind-conditional-concat.mjs
// File rule (Tailwind): className={'...' + (cond ? 'a' : 'b')} -> usá clsx/cn.
function isJsxFile(p) { return /\.(tsx|jsx)$/.test(String(p)); }

// className={ ... } cuyo contenido tiene una concatenación de strings con + y un ternario/&&.
const CONCAT_RE = /className\s*=\s*\{[^}]*['"][^'"}]*['"]\s*\+[^}]*\?[^}]*\}/;
const LOGIC_CONCAT_RE = /className\s*=\s*\{[^}]*['"][^'"}]*['"]\s*\+[^}]*&&[^}]*\}/;

export default function tailwindConditionalConcat(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.tailwind) || !isJsxFile(filePath)) return [];

  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (CONCAT_RE.test(lines[i]) || LOGIC_CONCAT_RE.test(lines[i])) {
      out.push({ rule: 'tailwind-conditional-concat', line: i + 1, severity: 'warn',
        message: `className armado por concatenación condicional. Usá clsx/cn: clases dinámicas mal concatenadas se rompen con el purge.` });
    }
  }
  return out;
}
