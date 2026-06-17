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

// project-aware: con cva en detected -> el mensaje lo nombra
const fullCva = { detected: { tailwind: true, tailwindComponentLib: 'cva' } };
const outCva = rule(bad, 'C.tsx', cfg, fullCva);
assert.equal(outCva.length, 1);
assert.match(outCva[0].message, /Tu proyecto usa cva/);
// sin lib -> mensaje genérico (no dice "Tu proyecto usa")
assert.doesNotMatch(rule(bad, 'C.tsx', cfg, full)[0].message, /Tu proyecto usa/);

// @apply: si el proyecto lo usa, el aviso lo ofrece
const fullApply = { detected: { tailwind: true, tailwindUsesApply: true } };
assert.match(rule(bad, 'C.tsx', cfg, fullApply)[0].message, /@apply/);
// sin @apply -> no lo menciona
assert.doesNotMatch(rule(bad, 'C.tsx', cfg, full)[0].message, /@apply/);
// combinado cva + apply -> menciona ambos
const fullBoth = { detected: { tailwind: true, tailwindComponentLib: 'cva', tailwindUsesApply: true } };
const mBoth = rule(bad, 'C.tsx', cfg, fullBoth)[0].message;
assert.match(mBoth, /cva/);
assert.match(mBoth, /@apply/);

console.log('tailwind-classname-bloat.test ok');
