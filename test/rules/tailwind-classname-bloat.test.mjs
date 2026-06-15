import rule from '../../rules/tailwind-classname-bloat.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, maxClasses: 4 };
const full = { detected: { tailwind: true } };

// 5 clases con maxClasses 4 -> finding
const bad = '<div className="p-4 flex gap-2 items-center justify-between">';
assert.equal(rule(bad, 'C.tsx', cfg, full).length, 1);

// 3 clases -> 0
assert.equal(rule('<div className="p-4 flex gap-2">', 'C.tsx', cfg, full).length, 0);
// sin tailwind -> 0
assert.equal(rule(bad, 'C.tsx', cfg, { detected: { tailwind: false } }).length, 0);
console.log('tailwind-classname-bloat.test ok');
