import assert from 'node:assert/strict';
import { isSuperset, sameShape, sameSet } from '../../lib/ast-shapes.mjs';

const big = new Map([['id', 'string'], ['name', 'string'], ['age', 'number']]);
const small = new Map([['id', 'string'], ['name', 'string']]);
assert.equal(isSuperset(big, small), true);
assert.equal(isSuperset(small, big), false);
assert.equal(isSuperset(big, big), false);
assert.equal(isSuperset(big, new Map([['id', 'number'], ['name', 'string']])), false);

assert.equal(sameShape(small, new Map([['name', 'string'], ['id', 'string']])), true);
assert.equal(sameShape(small, big), false);

assert.equal(sameSet(new Set(['a', 'b']), new Set(['b', 'a'])), true);
assert.equal(sameSet(new Set(['a']), new Set(['a', 'b'])), false);

console.log('ast-shapes.test ok');
