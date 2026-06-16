import assert from 'node:assert/strict';
import rule from '../../rules/schema-type-redeclare.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('schema-redeclare');
const full = { rules: { 'schema-type-redeclare': { enabled: true, minProps: 2 } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'schema-type-redeclare');
assert.match(out[0].message, /UserSchema/);
assert.match(out[0].message, /z\.infer/);

assert.equal(rule(ctx, { rules: { 'schema-type-redeclare': { enabled: false } } }).length, 0);

console.log('schema-type-redeclare.test ok');
