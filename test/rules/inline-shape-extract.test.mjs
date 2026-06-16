import assert from 'node:assert/strict';
import rule from '../../rules/inline-shape-extract.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('inline-shape');
const full = { rules: { 'inline-shape-extract': { enabled: true, minProps: 2 } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'inline-shape-extract');
assert.ok(out[0].file.endsWith('use.ts'), `file=${out[0].file}`);
assert.match(out[0].message, /Point/);

assert.equal(rule(ctx, { rules: { 'inline-shape-extract': { enabled: false } } }).length, 0);

console.log('inline-shape-extract.test ok');
