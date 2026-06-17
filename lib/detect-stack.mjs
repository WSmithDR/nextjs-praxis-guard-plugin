// lib/detect-stack.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TAILWIND_CONFIGS = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];

function stripJsonComments(s) {
  // quita /* */ y // (suficiente para tsconfig; no maneja // dentro de strings, raro en tsconfig)
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function detectStack(root) {
  const tsconfigPath = join(root, 'tsconfig.json');
  const hasTs = existsSync(tsconfigPath);
  const tailwindConfigPath = TAILWIND_CONFIGS.map((f) => join(root, f)).find((p) => existsSync(p)) || null;

  // package.json: tailwindcss (v4) + librería de componentes/variants (para el aviso de bloat).
  let hasTwDep = false;
  let tailwindComponentLib = null;
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const dep = (n) => (pkg.dependencies && pkg.dependencies[n]) || (pkg.devDependencies && pkg.devDependencies[n]);
    hasTwDep = !!dep('tailwindcss');
    if (dep('class-variance-authority')) tailwindComponentLib = 'cva';
    else if (dep('tailwind-variants')) tailwindComponentLib = 'tailwind-variants';
  } catch { /* sin package.json o no parseable */ }
  const tailwind = !!tailwindConfigPath || hasTwDep;

  // theme source: config (v3) o el primer CSS convencional que contenga @theme (v4).
  const CSS_THEME_CANDIDATES = ['app/globals.css', 'src/app/globals.css', 'styles/globals.css',
                                'src/index.css', 'src/styles/globals.css', 'app/styles/globals.css'];
  let tailwindThemeSource = tailwindConfigPath;
  if (!tailwindThemeSource) {
    for (const rel of CSS_THEME_CANDIDATES) {
      const p = join(root, rel);
      try { if (existsSync(p) && /@theme\b/.test(readFileSync(p, 'utf8'))) { tailwindThemeSource = p; break; } }
      catch { /* skip */ }
    }
  }

  let tsconfigOptions = null;
  let tsconfigFixable = false;
  if (hasTs) {
    let raw = '';
    try { raw = readFileSync(tsconfigPath, 'utf8'); } catch { raw = ''; }
    const hasComments = /\/\*[\s\S]*?\*\/|(^|[^:])\/\//.test(raw);
    let parsed = null;
    try { parsed = JSON.parse(raw); }
    catch { try { parsed = JSON.parse(stripJsonComments(raw)); } catch { parsed = null; } }
    if (parsed && typeof parsed === 'object') {
      tsconfigOptions = (parsed.compilerOptions && typeof parsed.compilerOptions === 'object') ? parsed.compilerOptions : {};
      tsconfigFixable = !hasComments && !('extends' in parsed);
    }
  }

  return {
    typescript: hasTs,
    tailwind,
    tailwindConfigPath,
    tailwindThemeSource,
    tailwindComponentLib,
    tsconfigPath: hasTs ? tsconfigPath : null,
    tsconfigOptions,
    tsconfigFixable,
  };
}
