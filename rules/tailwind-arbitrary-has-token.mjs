// rules/tailwind-arbitrary-has-token.mjs
// AST rule: un valor arbitrario `prefix-[valor]` que coincide con un token del theme del
// proyecto -> sugerir el token. Lee el theme con parseTailwindTheme (estático).
import { parseTailwindTheme } from '../lib/tailwind-theme.mjs';
import { extractClassNames } from '../lib/classname.mjs';
import { ARBITRARY_RE, categoryOf, normalizeValue, isJsxPath } from '../lib/tailwind-classes.mjs';

export const meta = { kind: 'ast' };

export default function tailwindArbitraryHasToken(ctx, full = {}) {
  const cfg = (full.rules && full.rules['tailwind-arbitrary-has-token']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.ts) return [];
  const det = full.detected || {};
  if (!det.tailwind || !det.tailwindConfigPath) return [];
  const theme = parseTailwindTheme(ctx.ts, det.tailwindConfigPath);
  if (!theme) return [];

  const out = [];
  for (const sf of ctx.sourceFiles) {
    if (!isJsxPath(sf.fileName)) continue;
    for (const { value, line } of extractClassNames(sf.getFullText())) {
      for (const cls of value.split(/\s+/).filter(Boolean)) {
        const m = ARBITRARY_RE.exec(cls);
        if (!m) continue;
        const cat = categoryOf(m[1]);
        if (!cat) continue;
        const token = theme[cat].get(normalizeValue(cat, m[2]));
        if (token) {
          out.push({
            rule: 'tailwind-arbitrary-has-token', severity: 'info', file: ctx.rel(sf.fileName), line,
            message: `Valor arbitrario "${cls}" coincide con el token "${token}" de tu theme. Usá "${m[1]}-${token}".`,
          });
        }
      }
    }
  }
  return out;
}
