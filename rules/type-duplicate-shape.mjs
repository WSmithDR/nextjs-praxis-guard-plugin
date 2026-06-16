// rules/type-duplicate-shape.mjs
// AST rule: un type/interface es superset de otro (otro archivo) -> sugerir Pick/Omit.
import { shapeOf, isSuperset } from '../lib/ast-shapes.mjs';

export const meta = { kind: 'ast' };

export default function typeDuplicateShape(ctx, full = {}) {
  const cfg = (full.rules && full.rules['type-duplicate-shape']) || {};
  if (cfg.enabled === false) return [];
  const minProps = cfg.minProps ?? 2;
  const { ts, checker, sourceFiles, rel } = ctx;

  // 1. juntar todas las declaraciones de tipo con nombre y su forma.
  const decls = [];   // { name, file, line, shape }
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) {
        const shape = shapeOf(ts, checker, checker.getTypeAtLocation(node.name), node);
        if (shape.size >= minProps) {
          const { line } = sf.getLineAndCharacterOfPosition(node.name.getStart());
          decls.push({ name: node.name.text, file: rel(sf.fileName), line: line + 1, shape });
        }
      }
      ts.forEachChild(node, visit);
    });
  }

  // 2. para cada A, el mejor B (otro archivo) cuyo set es subset de A.
  const out = [];
  for (const a of decls) {
    let best = null;
    for (const b of decls) {
      if (b === a || b.file === a.file) continue;
      if (isSuperset(a.shape, b.shape) && (!best || b.shape.size > best.shape.size)) best = b;
    }
    if (best) {
      const keys = [...best.shape.keys()].map((k) => `'${k}'`).join(', ');
      out.push({
        rule: 'type-duplicate-shape', severity: 'info', file: a.file, line: a.line,
        message: `"${a.name}" repite las props de "${best.name}" (${best.file}). Considerá derivar: Pick<${best.name}, ${keys}> (o Omit).`,
      });
    }
  }
  return out;
}
