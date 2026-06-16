// rules/type-duplicate-shape.mjs
// AST rule: detecta reuso de tipos cruzando archivos. Dos casos:
//  - duplicado EXACTO (misma forma, distinto archivo) -> sugerir unificar.
//  - superset estricto (A contiene todas las props de B y más) -> sugerir Pick/Omit.
import { collectNamedShapes, isSuperset, sameShape } from '../lib/ast-shapes.mjs';

export const meta = { kind: 'ast' };

export default function typeDuplicateShape(ctx, full = {}) {
  const cfg = (full.rules && full.rules['type-duplicate-shape']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.checker) return [];
  const minProps = cfg.minProps ?? 2;

  const decls = collectNamedShapes(ctx, minProps);   // orden estable
  const out = [];

  // 1. duplicados exactos cross-file: una vez por par (i<j) gracias al orden estable.
  for (let i = 0; i < decls.length; i++) {
    for (let j = i + 1; j < decls.length; j++) {
      const a = decls[i], b = decls[j];
      if (a.file === b.file) continue;
      if (sameShape(a.shape, b.shape)) {
        out.push({
          rule: 'type-duplicate-shape', severity: 'info', file: b.file, line: b.line,
          message: `"${b.name}" tiene la misma forma que "${a.name}" (${a.file}). Considerá unificarlos en un solo type (type ${b.name} = ${a.name}).`,
        });
      }
    }
  }

  // 2. superset estricto: reportamos el mayor B (otro archivo) como base de un Pick/Omit.
  //    Empates de tamaño: gana el primero en orden estable (decls ya viene ordenado).
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
