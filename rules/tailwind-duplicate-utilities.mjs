// rules/tailwind-duplicate-utilities.mjs
// File rule (Tailwind): clases duplicadas o de la misma familia repetidas en un className.
import { extractClassNames } from '../lib/classname.mjs';

function isJsxFile(p) { return /\.(tsx|jsx)$/.test(String(p)); }

// Familia = prefijo hasta el último '-' (p-4 -> 'p', text-sm -> 'text', bg-red-500 -> 'bg-red').
// Para utilities sin '-' (flex, block) la familia es la clase entera.
function family(cls) {
  const base = cls.replace(/^[a-z]+:/i, '');         // saca variantes (hover:, md:)
  const i = base.lastIndexOf('-');
  return i === -1 ? base : base.slice(0, i);
}

export default function tailwindDuplicateUtilities(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.tailwind) || !isJsxFile(filePath)) return [];

  const out = [];
  for (const { value, line } of extractClassNames(content)) {
    const classes = value.split(/\s+/).filter(Boolean);
    const seenExact = new Set();
    const seenFamily = new Map();
    let flagged = false;
    for (const cls of classes) {
      if (seenExact.has(cls)) { flagged = true; break; }
      seenExact.add(cls);
      const fam = family(cls);
      // solo familias "de valor único" conocidas que chocan (p, m, w, h, text, bg, gap, etc.)
      if (seenFamily.has(fam) && /^(p|m|px|py|pt|pb|pl|pr|mx|my|w|h|gap|text|bg)$/.test(fam)) { flagged = true; break; }
      seenFamily.set(fam, cls);
    }
    // display contradictorio
    const displays = classes.filter((c) => /^(block|flex|grid|inline|inline-block|hidden|contents)$/.test(c));
    if (displays.length > 1) flagged = true;
    if (flagged) {
      out.push({ rule: 'tailwind-duplicate-utilities', line, severity: 'warn',
        message: `Clases duplicadas o contradictorias en el className. Dejá una sola por propiedad.` });
    }
  }
  return out;
}
