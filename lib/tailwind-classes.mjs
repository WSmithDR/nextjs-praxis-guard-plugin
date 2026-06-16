// lib/tailwind-classes.mjs
// Helpers compartidos para las reglas Tailwind theme-aware. Única fuente de verdad de la
// normalización de valores: el match className-side y el parse theme-side usan la MISMA
// función, así no pueden driftear (si lo hicieran, el match silenciosamente fallaría).

export const COLOR_PREFIXES = new Set(['bg', 'text', 'border', 'ring', 'from', 'to', 'via', 'fill', 'stroke', 'divide', 'outline', 'decoration', 'caret', 'accent']);
export const SPACING_PREFIXES = new Set(['w', 'h', 'min-w', 'max-w', 'min-h', 'max-h', 'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'gap', 'gap-x', 'gap-y', 'space-x', 'space-y', 'inset', 'top', 'right', 'bottom', 'left', 'size']);

// Una clase entera con valor arbitrario: prefix-[valor].
export const ARBITRARY_RE = /^(-?[a-z][a-z-]*)-\[([^\]]+)\]$/;

const isHex = (v) => /^#[0-9a-fA-F]{3,8}$/.test(v);

export function categoryOf(prefix) {
  if (COLOR_PREFIXES.has(prefix)) return 'colors';
  if (SPACING_PREFIXES.has(prefix)) return 'spacing';
  return null;
}

// Normaliza un valor para una categoría: hex de color a minúsculas; el resto, trim.
export function normalizeValue(category, v) {
  return category === 'colors' && isHex(v) ? v.toLowerCase() : v.trim();
}

// Atajo para colores (lo usa el parser del theme, que ya conoce la categoría).
export function normalizeColor(v) { return normalizeValue('colors', v); }

export function isJsxPath(p) { return /\.(tsx|jsx)$/.test(String(p)); }
