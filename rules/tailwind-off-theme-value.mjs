// rules/tailwind-off-theme-value.mjs
// AST rule (experimental, default off): valor arbitrario de color/spacing que NO está en el theme.
import { parseTailwindTheme } from '../lib/tailwind-theme.mjs';
import { extractClassNames } from '../lib/classname.mjs';
import { ARBITRARY_RE, categoryOf, normalizeValue, isJsxPath } from '../lib/tailwind-classes.mjs';

export const meta = { kind: 'ast' };

export default function tailwindOffThemeValue(ctx, full = {}) {
  const cfg = (full.rules && full.rules['tailwind-off-theme-value']) || {};
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
        if (!theme[cat].has(normalizeValue(cat, m[2]))) {
          out.push({
            rule: 'tailwind-off-theme-value', severity: 'info', file: ctx.rel(sf.fileName), line,
            message: `"${cls}" usa un valor que no está en tu theme. Agregalo al theme o usá un token existente.`,
          });
        }
      }
    }
  }
  return out;
}
