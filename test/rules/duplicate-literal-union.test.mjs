import rule from '../../rules/duplicate-literal-union.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, minMembers: 2, minRepeats: 2 };
const full = { detected: { typescript: true } };

// misma union 2 veces (orden distinto => normaliza) -> finding
const bad = [
  "function a(x: 'sm' | 'md' | 'lg') {}",
  "let y: 'lg' | 'md' | 'sm';",
].join('\n');
const out = rule(bad, 'a.ts', cfg, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'duplicate-literal-union');

// union única -> 0
assert.equal(rule("function a(x: 'sm' | 'md') {}", 'a.ts', cfg, full).length, 0);
// gating sin TS -> 0
assert.equal(rule(bad, 'a.ts', cfg, { detected: { typescript: false } }).length, 0);
console.log('duplicate-literal-union.test ok');
