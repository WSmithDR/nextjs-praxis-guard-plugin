import assert from 'node:assert/strict';
import rule from '../../rules/prefer-satisfies.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('prefer-satisfies');
const out = rule(ctx, { rules: { 'prefer-satisfies': { enabled: true } } });
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'prefer-satisfies');
assert.match(out[0].message, /cfg/);
assert.match(out[0].message, /satisfies Config/);

assert.equal(rule(ctx, { rules: { 'prefer-satisfies': { enabled: false } } }).length, 0);
console.log('prefer-satisfies.test ok');
