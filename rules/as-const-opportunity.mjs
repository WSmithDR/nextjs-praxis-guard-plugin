// rules/as-const-opportunity.mjs
// AST rule: `const X = [..]/{..}` SIN `as const`, referenciado por `typeof X[...]`
// (fuente de una union que se ensancha). Cross-statement -> necesita ver todo el programa.
// `as const` hace que el initializer sea un AsExpression, no un literal -> no es candidato.
export const meta = { kind: 'ast' };

export default function asConstOpportunity(ctx, full = {}) {
  const cfg = (full.rules && full.rules['as-const-opportunity']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.checker) return [];
  const { ts, sourceFiles, rel } = ctx;

  const candidates = new Map();
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer
          && (ts.isArrayLiteralExpression(node.initializer) || ts.isObjectLiteralExpression(node.initializer))) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        candidates.set(node.name.text, { file: rel(sf.fileName), line: line + 1 });
      }
      ts.forEachChild(node, visit);
    });
  }
  if (!candidates.size) return [];

  const used = new Set();
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isIndexedAccessTypeNode(node) && ts.isTypeQueryNode(node.objectType)) {
        const e = node.objectType.exprName;
        const id = ts.isIdentifier(e) ? e.text : (ts.isQualifiedName(e) ? e.right.text : null);
        if (id && candidates.has(id)) used.add(id);
      }
      ts.forEachChild(node, visit);
    });
  }

  const out = [];
  for (const [name, loc] of candidates) {
    if (!used.has(name)) continue;
    out.push({
      rule: 'as-const-opportunity', severity: 'info', file: loc.file, line: loc.line,
      message: `"${name}" alimenta una union (typeof ${name}[...]) pero no es 'as const'; la union se ensancha. Agregá 'as const'.`,
    });
  }
  return out;
}
