import assert from 'node:assert/strict';
import rule from '../../rules/prefer-branded-type.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('branded-type');
const out = rule(ctx, { rules: { 'prefer-branded-type': { enabled: true } } });
assert.equal(out.length, 1, `got ${out.length}`);
assert.match(out[0].message, /UserId/);
assert.ok(!out.some((f) => /UserName|Point/.test(f.message)), 'solo identidades primitivas');

assert.equal(rule(ctx, { rules: { 'prefer-branded-type': { enabled: false } } }).length, 0);
console.log('prefer-branded-type.test ok');
