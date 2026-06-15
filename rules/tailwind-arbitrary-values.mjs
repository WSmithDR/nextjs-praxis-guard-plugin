// rules/tailwind-arbitrary-values.mjs
// File rule (Tailwind): valores arbitrarios w-[473px], text-[#fff] -> usá tokens del theme.
import { extractClassNames } from '../lib/classname.mjs';

function isJsxFile(p) { return /\.(tsx|jsx)$/.test(String(p)); }

export default function tailwindArbitraryValues(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.tailwind) || !isJsxFile(filePath)) return [];
  const allow = config.allow || [];

  const out = [];
  for (const { value, line } of extractClassNames(content)) {
    for (const cls of value.split(/\s+/).filter(Boolean)) {
      if (!/-\[[^\]]+\]/.test(cls)) continue;             // no es arbitrary value
      if (allow.some((p) => cls.startsWith(p))) continue;  // permitido
      out.push({ rule: 'tailwind-arbitrary-values', line, severity: 'info',
        message: `Valor arbitrario de Tailwind "${cls}". Usá un token del theme en vez de un valor hardcodeado.` });
    }
  }
  return out;
}
