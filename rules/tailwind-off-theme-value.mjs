// rules/tailwind-off-theme-value.mjs
// AST rule (experimental, default off): valor arbitrario de color/spacing que NO está en el theme.
import { parseTailwindTheme } from '../lib/tailwind-theme.mjs';
import { extractClassNames } from '../lib/classname.mjs';

export const meta = { kind: 'ast' };

const COLOR = new Set(['bg','text','border','ring','from','to','via','fill','stroke','divide','outline','decoration','caret','accent']);
const SPACING = new Set(['w','h','min-w','max-w','min-h','max-h','p','px','py','pt','pr','pb','pl','m','mx','my','mt','mr','mb','ml','gap','gap-x','gap-y','space-x','space-y','inset','top','right','bottom','left','size']);
const ARB = /^(-?[a-z][a-z-]*)-\[([^\]]+)\]$/;

function categoryOf(prefix) { return COLOR.has(prefix) ? 'colors' : (SPACING.has(prefix) ? 'spacing' : null); }
function norm(cat, v) { return cat === 'colors' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v.toLowerCase() : v.trim(); }
function isJsx(p) { return /\.(tsx|jsx)$/.test(String(p)); }

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
    if (!isJsx(sf.fileName)) continue;
    for (const { value, line } of extractClassNames(sf.getFullText())) {
      for (const cls of value.split(/\s+/).filter(Boolean)) {
        const m = ARB.exec(cls);
        if (!m) continue;
        const cat = categoryOf(m[1]);
        if (!cat) continue;
        if (!theme[cat].has(norm(cat, m[2]))) {
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
