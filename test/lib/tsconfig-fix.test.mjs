import { computeMissing } from '../../lib/tsconfig-fix.mjs';
import assert from 'node:assert/strict';

// faltan / están en false -> se reportan
assert.deepEqual(
  computeMissing({ strict: false, noImplicitAny: true }, ['strict', 'noImplicitAny', 'noUncheckedIndexedAccess']),
  ['strict', 'noUncheckedIndexedAccess']
);
// todo cubierto -> []
assert.deepEqual(computeMissing({ strict: true }, ['strict']), []);
// options null -> todo el baseline falta
assert.deepEqual(computeMissing(null, ['strict']), ['strict']);
console.log('tsconfig-fix.test ok');
