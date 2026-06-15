import rule from '../../rules/repeated-object-shape.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, minProps: 2, minRepeats: 2 };
const full = { detected: { typescript: true } };

// mismo shape 2 veces (orden distinto de claves => normaliza) -> finding
const bad = [
  'function a(x: { id: string; name: string }) {}',
  'function b(y: { name: string; id: string }) {}',
].join('\n');
const out = rule(bad, 'a.ts', cfg, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'repeated-object-shape');

// shape único -> 0
assert.equal(rule('function a(x: { id: string; name: string }) {}', 'a.ts', cfg, full).length, 0);

// gating: archivo .js -> 0
assert.equal(rule(bad, 'a.js', cfg, full).length, 0);
// gating: sin TS detectado -> 0
assert.equal(rule(bad, 'a.ts', cfg, { detected: { typescript: false } }).length, 0);
console.log('repeated-object-shape.test ok');
