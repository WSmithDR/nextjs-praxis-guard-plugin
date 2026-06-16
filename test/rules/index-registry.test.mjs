import assert from 'node:assert/strict';
import { AST_RULES, PROJECT_RULES } from '../../rules/index.mjs';

for (const id of ['type-duplicate-shape', 'inline-shape-extract', 'schema-type-redeclare',
                  'prefer-satisfies', 'as-const-opportunity', 'prefer-discriminated-union', 'prefer-branded-type']) {
  assert.equal(typeof AST_RULES[id], 'function', `AST_RULES[${id}]`);
}
assert.equal(typeof PROJECT_RULES['magic-literal-repeated'], 'function', 'magic-literal en PROJECT_RULES');

console.log('index-registry.test ok');
