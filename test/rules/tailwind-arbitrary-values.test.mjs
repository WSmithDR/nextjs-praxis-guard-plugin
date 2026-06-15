import rule from '../../rules/tailwind-arbitrary-values.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, allow: [] };
const full = { detected: { tailwind: true } };

// valor arbitrario -> finding
const bad = '<div className="w-[473px] text-sm">';
const out = rule(bad, 'C.tsx', cfg, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'tailwind-arbitrary-values');

// sin arbitrarios -> 0
assert.equal(rule('<div className="w-4 text-sm">', 'C.tsx', cfg, full).length, 0);
// allow cubre el prefijo -> 0
assert.equal(rule('<div className="grid-cols-[1fr_2fr]">', 'C.tsx', { enabled: true, allow: ['grid-cols-'] }, full).length, 0);
// sin tailwind detectado -> 0
assert.equal(rule(bad, 'C.tsx', cfg, { detected: { tailwind: false } }).length, 0);
// archivo .ts (no JSX) -> 0
assert.equal(rule(bad, 'C.ts', cfg, full).length, 0);
console.log('tailwind-arbitrary-values.test ok');
