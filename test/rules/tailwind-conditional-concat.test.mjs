import rule from '../../rules/tailwind-conditional-concat.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };
const full = { detected: { tailwind: true } };

// concatenación con ternario dentro de className={...} -> finding
const bad = "<div className={'p-4 ' + (active ? 'bg-blue' : 'bg-gray')}>";
assert.equal(rule(bad, 'C.tsx', cfg, full).length, 1);

// uso de cn/clsx -> 0
assert.equal(rule('<div className={cn("p-4", active && "bg-blue")}>', 'C.tsx', cfg, full).length, 0);
// className estático -> 0
assert.equal(rule('<div className="p-4">', 'C.tsx', cfg, full).length, 0);
// sin tailwind -> 0
assert.equal(rule(bad, 'C.tsx', cfg, { detected: { tailwind: false } }).length, 0);
console.log('tailwind-conditional-concat.test ok');
