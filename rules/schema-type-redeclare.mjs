// rules/schema-type-redeclare.mjs
// AST rule: type a mano cuyas keys == las de un schema z.object -> sugerir z.infer.
// Compara por NOMBRES de propiedad (los keys del z.object literal vs el named type),
// que es determinístico y no depende de la versión de Zod.
import { shapeNames, sameSet, isDerivedAlias } from '../lib/ast-shapes.mjs';

export const meta = { kind: 'ast' };

export default function schemaTypeRedeclare(ctx, full = {}) {
  const cfg = (full.rules && full.rules['schema-type-redeclare']) || {};
  if (cfg.enabled === false) return [];
  const minProps = cfg.minProps ?? 2;
  if (!ctx || !ctx.checker) return [];
  const { ts, checker, sourceFiles, rel } = ctx;

  // 0. ¿el proyecto importa zod? si no, no-op.
  const usesZod = sourceFiles.some((sf) =>
    sf.statements.some((s) => ts.isImportDeclaration(s)
      && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === 'zod'));
  if (!usesZod) return [];

  // 1. schemas: const X = z.object({...}) -> { name, keys:Set }
  const schemas = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer) {
        const keys = zObjectKeys(ts, node.initializer);
        if (keys && keys.size >= minProps) schemas.push({ name: node.name.text, keys });
      }
      ts.forEachChild(node, visit);
    });
  }
  if (!schemas.length) return [];

  // 2. named types (no ya derivados con z.infer) cuyo set de nombres == el de un schema.
  const out = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name && !isDerivedAlias(ts, node)) {
        const names = shapeNames(ts, checker, checker.getTypeAtLocation(node.name));
        if (names.size >= minProps) {
          const match = schemas.find((s) => sameSet(s.keys, names));
          if (match) {
            const { line } = sf.getLineAndCharacterOfPosition(node.name.getStart());
            out.push({
              rule: 'schema-type-redeclare', severity: 'info', file: rel(sf.fileName), line: line + 1,
              message: `El type "${node.name.text}" duplica la forma del schema "${match.name}". Considerá: type ${node.name.text} = z.infer<typeof ${match.name}>.`,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  return out;
}

// keys de un z.object({...}), soportando encadenados (.partial(), .optional(), etc).
function zObjectKeys(ts, expr) {
  let e = expr;
  while (e && ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
    if (e.expression.name.text === 'object'
        && e.arguments[0] && ts.isObjectLiteralExpression(e.arguments[0])) {
      const set = new Set();
      for (const p of e.arguments[0].properties) {
        if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
            && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
          set.add(p.name.text);
        }
      }
      return set;
    }
    e = e.expression.expression;   // bajar al receptor (antes del .partial(), etc)
  }
  return null;
}
