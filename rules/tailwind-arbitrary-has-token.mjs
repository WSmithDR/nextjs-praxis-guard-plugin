// rules/tailwind-arbitrary-has-token.mjs
// AST rule: un valor arbitrario `prefix-[valor]` que coincide con un token del theme del
// proyecto -> sugerir el token. Lee el theme con parseTailwindTheme (estático).
import { parseTailwindTheme } from '../lib/tailwind-theme.mjs';
import { extractClassNames } from '../lib/classname.mjs';

export const meta = { kind: 'ast' };

const COLOR = new Set(['bg','text','border','ring','from','to','via','fill','stroke','divide','outline','decoration','caret','accent']);
const SPACING = new Set(['w','h','min-w','max-w','min-h','max-h','p','px','py','pt','pr','pb','pl','m','mx','my','mt','mr','mb','ml','gap','gap-x','gap-y','space-x','space-y','inset','top','right','bottom','left','size']);
const ARB = /^(-?[a-z][a-z-]*)-\[([^\]]+)\]$/;

function categoryOf(prefix) { return COLOR.has(prefix) ? 'colors' : (SPACING.has(prefix) ? 'spacing' : null); }
function norm(cat, v) { return cat === 'colors' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v.toLowerCase() : v.trim(); }
function isJsx(p) { return /\.(tsx|jsx)$/.test(String(p)); }

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
    if (!isJsx(sf.fileName)) continue;
    for (const { value, line } of extractClassNames(sf.getFullText())) {
      for (const cls of value.split(/\s+/).filter(Boolean)) {
        const m = ARB.exec(cls);
        if (!m) continue;
        const cat = categoryOf(m[1]);
        if (!cat) continue;
        const token = theme[cat].get(norm(cat, m[2]));
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
