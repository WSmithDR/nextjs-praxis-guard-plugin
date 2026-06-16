import assert from 'node:assert/strict';
import { isDerivedAlias } from '../../lib/ast-shapes.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

// isDerivedAlias es un chequeo AST puro: una interface no es derivada; un alias
// Pick<...> y un z.infer<...> sí lo son (ya son reuso, no duplicación).
const ctx = await buildContextFor('derived-aliases');
const { ts } = ctx;
const byName = {};
for (const sf of ctx.sourceFiles) {
  ts.forEachChild(sf, (node) => {
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) byName[node.name.text] = node;
  });
}
assert.equal(isDerivedAlias(ts, byName['Plain']), false, 'interface no es derivada');
assert.equal(isDerivedAlias(ts, byName['Picked']), true, 'Pick<...> es derivada');
assert.equal(isDerivedAlias(ts, byName['Inferred']), true, 'z.infer<...> es derivada');

console.log('ast-shapes-derived.test ok');
