import assert from 'node:assert/strict';
import rule from '../../rules/schema-type-redeclare.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

// z.object({...}).partial() encadenado: zObjectKeys debe desenvolver la cadena.
const ctx = await buildContextFor('schema-chain');
const out = rule(ctx, { rules: { 'schema-type-redeclare': { enabled: true, minProps: 2 } } });
assert.equal(out.length, 1, `got ${out.length}`);
assert.match(out[0].message, /FormSchema/);

console.log('schema-type-redeclare-chain.test ok');
