import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const d = JSON.parse(readFileSync(join(root, 'config', 'defaults.json'), 'utf8'));

for (const id of ['type-duplicate-shape', 'inline-shape-extract', 'schema-type-redeclare', 'magic-literal-repeated']) {
  assert.ok(d.rules[id], `falta default de ${id}`);
  assert.equal(d.rules[id].enabled, true, `${id} debe arrancar enabled`);
}
assert.equal(d.rules['type-duplicate-shape'].minProps, 2);
assert.equal(d.rules['magic-literal-repeated'].minFiles, 3);

assert.equal(d.rules['prefer-satisfies'].enabled, true);
assert.equal(d.rules['as-const-opportunity'].enabled, true);
assert.equal(d.rules['prefer-discriminated-union'].enabled, false, 'experimental, default off');
assert.equal(d.rules['prefer-branded-type'].enabled, false, 'experimental, default off');

console.log('defaults-ast.test ok');
