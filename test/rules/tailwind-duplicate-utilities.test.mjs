import rule from '../../rules/tailwind-duplicate-utilities.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };
const full = { detected: { tailwind: true } };

// p-2 y p-4 (misma familia p-) -> finding
assert.equal(rule('<div className="p-2 flex p-4">', 'C.tsx', cfg, full).length, 1);
// clase exacta duplicada -> finding
assert.equal(rule('<div className="flex gap-2 flex">', 'C.tsx', cfg, full).length, 1);
// sin duplicados -> 0
assert.equal(rule('<div className="p-2 flex gap-2">', 'C.tsx', cfg, full).length, 0);
// sin tailwind -> 0
assert.equal(rule('<div className="p-2 p-4">', 'C.tsx', cfg, { detected: { tailwind: false } }).length, 0);
console.log('tailwind-duplicate-utilities.test ok');
