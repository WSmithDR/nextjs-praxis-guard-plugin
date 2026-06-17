// rules/tailwind-classname-bloat.mjs
// File rule (Tailwind): className con demasiadas clases -> extraé a componente o cva.
import { extractClassNames } from '../lib/classname.mjs';

function isJsxFile(p) { return /\.(tsx|jsx)$/.test(String(p)); }

export default function tailwindClassnameBloat(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.tailwind) || !isJsxFile(filePath)) return [];
  const maxClasses = config.maxClasses ?? 12;

  const out = [];
  for (const { value, line } of extractClassNames(content)) {
    const n = value.split(/\s+/).filter(Boolean).length;
    if (n > maxClasses) {
      const det = full.detected || {};
      const lib = det.tailwindComponentLib;
      const apply = det.tailwindUsesApply ? ' o a una clase con @apply' : '';
      const tip = lib
        ? `Tu proyecto usa ${lib}: extraé esta lista a una variante/componente con ${lib}${apply}.`
        : `Extraé a un componente o usá cva/tailwind-variants${apply}.`;
      out.push({ rule: 'tailwind-classname-bloat', line, severity: 'info',
        message: `className con ${n} clases (umbral ${maxClasses}). ${tip}` });
    }
  }
  return out;
}
