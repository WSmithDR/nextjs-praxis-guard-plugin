// rules/inline-shape-extract.mjs
// AST rule: object-type inline cuya forma == un named type existente -> referenciarlo.
import { shapeOf, sameShape, collectNamedShapes } from '../lib/ast-shapes.mjs';

export const meta = { kind: 'ast' };

export default function inlineShapeExtract(ctx, full = {}) {
  const cfg = (full.rules && full.rules['inline-shape-extract']) || {};
  if (cfg.enabled === false) return [];
  const minProps = cfg.minProps ?? 2;
  if (!ctx || !ctx.checker) return [];
  const { ts, checker, sourceFiles, rel } = ctx;

  // 1. catálogo de named types con su forma.
  const named = collectNamedShapes(ctx, minProps);

  // 2. TypeLiterals inline (no el cuerpo directo de un `type X = {...}`; los anidados sí se inspeccionan) que igualen un named type.
  const out = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isTypeLiteralNode(node) && !(node.parent && ts.isTypeAliasDeclaration(node.parent))) {
        const shape = shapeOf(ts, checker, checker.getTypeAtLocation(node), node);
        if (shape.size >= minProps) {
          const match = named.find((n) => sameShape(n.shape, shape));
          if (match) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            out.push({
              rule: 'inline-shape-extract', severity: 'info', file: rel(sf.fileName), line: line + 1,
              message: `Esta forma inline coincide con el type "${match.name}". Considerá referenciarlo por nombre.`,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  return out;
}
