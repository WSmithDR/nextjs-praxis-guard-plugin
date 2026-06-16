import assert from 'node:assert/strict';
import rule from '../../rules/type-duplicate-shape.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('type-duplicate');
const full = { rules: { 'type-duplicate-shape': { enabled: true, minProps: 2 } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'type-duplicate-shape');
assert.equal(out[0].severity, 'info');
assert.ok(out[0].file.endsWith('base.ts'), `file=${out[0].file}`);
assert.match(out[0].message, /Contact/);
assert.match(out[0].message, /Pick<Contact/);

assert.equal(rule(ctx, { rules: { 'type-duplicate-shape': { enabled: false } } }).length, 0);

console.log('type-duplicate-shape.test ok');
