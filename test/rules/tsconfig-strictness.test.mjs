import rule from '../../rules/tsconfig-strictness.mjs';
import assert from 'node:assert/strict';

const tree = { files: [], dirs: new Set() };

// baseline cubierto -> 0
const full1 = { detected: { typescript: true, tsconfigOptions: { strict: true, noImplicitAny: true } },
  rules: { 'tsconfig-strictness': { enabled: true, baseline: ['strict', 'noImplicitAny'] } } };
assert.equal(rule(tree, full1).length, 0);

// falta un flag -> 1 finding con file tsconfig.json
const full2 = { detected: { typescript: true, tsconfigOptions: { strict: false } },
  rules: { 'tsconfig-strictness': { enabled: true, baseline: ['strict', 'noImplicitAny'] } } };
const out = rule(tree, full2);
assert.equal(out.length, 2, `got ${out.length}`);  // strict(false) + noImplicitAny(ausente)
assert.equal(out[0].file, 'tsconfig.json');
assert.equal(out[0].severity, 'warn');

// sin TS -> 0
assert.equal(rule(tree, { detected: { typescript: false }, rules: { 'tsconfig-strictness': { enabled: true } } }).length, 0);
// tsconfigOptions null -> 0
assert.equal(rule(tree, { detected: { typescript: true, tsconfigOptions: null }, rules: { 'tsconfig-strictness': { enabled: true, baseline: ['strict'] } } }).length, 0);
console.log('tsconfig-strictness.test ok');
