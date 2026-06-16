// rules/prefer-satisfies.mjs
// AST rule: `const x: T = { … }` con T un type con nombre -> sugerir `{ … } satisfies T`
// (preserva la inferencia angosta sin perder el chequeo). Si ya usa `satisfies`, el
// initializer es un SatisfiesExpression (no ObjectLiteral) y no dispara.
export const meta = { kind: 'ast' };

export default function preferSatisfies(ctx, full = {}) {
  const cfg = (full.rules && full.rules['prefer-satisfies']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.checker) return [];
  const minProps = cfg.minProps ?? 1;
  const { ts, sourceFiles, rel } = ctx;

  const out = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isVariableDeclaration(node) && node.type && node.initializer
          && ts.isTypeReferenceNode(node.type)
          && ts.isObjectLiteralExpression(node.initializer)
          && node.initializer.properties.length >= minProps) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        const typeName = node.type.typeName.getText();
        const varName = node.name.getText();
        out.push({
          rule: 'prefer-satisfies', severity: 'info', file: rel(sf.fileName), line: line + 1,
          message: `"${varName}" anota el tipo "${typeName}" y pierde la inferencia angosta. Considerá: const ${varName} = { … } satisfies ${typeName}.`,
        });
      }
      ts.forEachChild(node, visit);
    });
  }
  return out;
}
