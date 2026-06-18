// rules/tailwind-content-coverage.mjs
// Project rule (opt-in, requiere arquitectura): verifica que el `content` de tailwind.config
// cubra featuresDir y sharedDirs. Bug real y silencioso: al mover componentes con clases
// Tailwind a esas carpetas, si `content` solo tenía `app/**`, Tailwind purga las clases
// (build verde, sin error de tsc, página sin estilos). praxis-guard es el único que conoce
// la arquitectura, así que es el único que puede agarrarlo.
import { readFileSync } from 'node:fs';

export const meta = { kind: 'project' };

export default function tailwindContentCoverage(tree, full = {}) {
  const cfg = (full.rules && full.rules['tailwind-content-coverage']) || {};
  if (cfg.enabled === false) return [];
  const arch = full.architecture || {};
  if (arch.strategy == null) return [];                       // opt-in vía arquitectura declarada
  const twPath = full.detected && full.detected.tailwindConfigPath;
  if (!twPath) return [];                                     // sin tailwind.config no aplica

  let src;
  try { src = readFileSync(twPath, 'utf8'); } catch { return []; }
  const globs = extractContentGlobs(src);
  if (globs.length === 0) return [];                          // no parseable -> fail-open, no marcamos

  const targets = [arch.featuresDir, ...(arch.sharedDirs || [])].filter(Boolean).map(norm);
  const prefixes = globs.map(globPrefix);
  const root = (tree && tree.root ? String(tree.root).replace(/\\/g, '/') : '') + '/';
  const file = twPath.replace(/\\/g, '/').replace(root, '');

  const out = [];
  for (const dir of targets) {
    const covered = prefixes.some((p) => p === '' || dir === p || dir.startsWith(p + '/'));
    if (!covered) {
      out.push({ rule: 'tailwind-content-coverage', severity: 'warn', file,
        message: `El "content" de tailwind.config no cubre "${dir}". Tailwind purgará las clases de los componentes ahí (build verde, página sin estilos). Agregá un glob: "./${dir}/**/*.{js,ts,jsx,tsx}".` });
    }
  }
  return out;
}

function norm(d) { return String(d).replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, ''); }

// strings del array `content: [...]` (regex; cubre el caso común JS/TS).
function extractContentGlobs(src) {
  const m = src.match(/content\s*:\s*\[([\s\S]*?)\]/);
  if (!m) return [];
  const out = [];
  const re = /['"`]([^'"`]+)['"`]/g;
  let g;
  while ((g = re.exec(m[1])) !== null) out.push(g[1]);
  return out;
}

// prefijo estático de un glob (antes del primer comodín) reducido a su directorio.
function globPrefix(glob) {
  let g = String(glob).replace(/\\/g, '/').replace(/^\.?\//, '');
  const star = g.search(/[*{?[]/);
  if (star !== -1) g = g.slice(0, star);
  const slash = g.lastIndexOf('/');
  return slash === -1 ? '' : g.slice(0, slash);
}
