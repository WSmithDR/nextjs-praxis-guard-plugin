import assert from 'node:assert/strict';
import rule from '../../rules/prefer-discriminated-union.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('discriminated-union');
const cfg = { rules: { 'prefer-discriminated-union': { enabled: true, minMembers: 2 } } };
const out = rule(ctx, cfg);
assert.equal(out.length, 1, `got ${out.length}`);
assert.match(out[0].message, /Shape/);
assert.ok(!out.some((f) => /Animal/.test(f.message)), 'Animal ya tiene discriminante');

assert.equal(rule(ctx, { rules: { 'prefer-discriminated-union': { enabled: false } } }).length, 0);
console.log('prefer-discriminated-union.test ok');
