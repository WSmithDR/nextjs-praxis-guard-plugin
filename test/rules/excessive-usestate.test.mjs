import rule from '../../rules/excessive-usestate.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };
const comp = (n) => {
  const lines = Array.from({ length: n }, (_, i) => `  const [s${i}, setS${i}] = useState(0);`).join('\n');
  return `import { useState } from 'react';\nexport function Form() {\n${lines}\n  return <div/>;\n}`;
};

// default: hasta 3 ok, avisa con 4+
assert.equal(rule(comp(3), 'Form.tsx', cfg).length, 0, '3 useState está ok');
const r = rule(comp(5), 'Form.tsx', cfg);
assert.equal(r.length, 1, '5 useState avisa');
assert.equal(r[0].severity, 'info');
assert.equal(r[0].rule, 'excessive-usestate');
assert.ok(/5 useState/.test(r[0].message), 'reporta el conteo');
assert.ok(r[0].line, 'reporta línea');

// el import `{ useState }` no cuenta como call-site (3 calls = ok pese al import)
assert.equal(rule(comp(3), 'Form.tsx', cfg).length, 0, 'el import no infla el conteo');

// useState<T>() y React.useState() cuentan
const generic = `export function F(){\n const a=useState<number>(0);\n const b=React.useState(1);\n const c=useState(2);\n const d=useState(3);\n return <div/>;\n}`;
assert.equal(rule(generic, 'F.tsx', cfg).length, 1, 'useState<T> y React.useState cuentan');

// max configurable
assert.equal(rule(comp(4), 'Form.tsx', { enabled: true, max: 5 }).length, 0, 'max:5 no avisa con 4');
assert.equal(rule(comp(3), 'Form.tsx', { enabled: true, max: 2 }).length, 1, 'max:2 avisa con 3');

// fuera de scope / disabled
assert.equal(rule(comp(6), 'hook.ts', cfg).length, 0, 'solo .tsx/.jsx');
assert.equal(rule(comp(6), 'Form.tsx', { enabled: false }).length, 0, 'disabled');
console.log('excessive-usestate.test ok');
