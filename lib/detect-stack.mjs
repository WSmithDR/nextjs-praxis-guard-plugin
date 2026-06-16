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
  const tailwind = TAILWIND_CONFIGS.some((f) => existsSync(join(root, f)));
  const tailwindConfigPath = TAILWIND_CONFIGS.map((f) => join(root, f)).find((p) => existsSync(p)) || null;

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
    tsconfigPath: hasTs ? tsconfigPath : null,
    tsconfigOptions,
    tsconfigFixable,
  };
}
