import assert from 'node:assert/strict';
import rule from '../../rules/as-const-opportunity.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('as-const');
const out = rule(ctx, { rules: { 'as-const-opportunity': { enabled: true } } });
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'as-const-opportunity');
assert.match(out[0].message, /ROLES/);
assert.ok(out[0].file.endsWith('a.ts'), `file=${out[0].file}`);

assert.equal(rule(ctx, { rules: { 'as-const-opportunity': { enabled: false } } }).length, 0);
console.log('as-const-opportunity.test ok');
