import rule from '../../rules/stringly-typed.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, minLiterals: 2 };
const full = { detected: { typescript: true } };

// mismo id comparado contra 2 strings -> finding
const bad = "if (status === 'active' || status === 'pending') {}";
const out = rule(bad, 'a.ts', cfg, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'stringly-typed');
assert.equal(out[0].line, 1);

// una sola comparación -> 0
assert.equal(rule("if (status === 'active') {}", 'a.ts', cfg, full).length, 0);
// gating .js -> 0
assert.equal(rule(bad, 'a.js', cfg, full).length, 0);
console.log('stringly-typed.test ok');
