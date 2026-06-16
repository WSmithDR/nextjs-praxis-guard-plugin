// rules/prefer-discriminated-union.mjs
// AST rule (experimental, default off): `type T = A | B | …` de tipos objeto SIN un campo
// discriminante (una prop común cuyo tipo es un string/number literal DISTINTO en cada miembro).
export const meta = { kind: 'ast' };

const LITERAL = (ts) => ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral;

function symType(checker, sym) {
  const decl = sym.valueDeclaration || (sym.declarations && sym.declarations[0]);
  try { return decl ? checker.getTypeOfSymbolAtLocation(sym, decl) : null; } catch { return null; }
}

function hasDiscriminant(ts, checker, memberTypes) {
  const litFlag = LITERAL(ts);
  const firstProps = memberTypes[0].getProperties().map((s) => s.getName());
  for (const name of firstProps) {
    const vals = [];
    let ok = true;
    for (const t of memberTypes) {
      const sym = t.getProperty(name);
      const pt = sym && symType(checker, sym);
      if (!pt || !(pt.flags & litFlag)) { ok = false; break; }
      vals.push(checker.typeToString(pt));
    }
    if (ok && new Set(vals).size === vals.length) return true;
  }
  return false;
}

export default function preferDiscriminatedUnion(ctx, full = {}) {
  const cfg = (full.rules && full.rules['prefer-discriminated-union']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.checker) return [];
  const minMembers = cfg.minMembers ?? 2;
  const { ts, checker, sourceFiles, rel } = ctx;

  const out = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isTypeAliasDeclaration(node) && node.type && ts.isUnionTypeNode(node.type)
          && node.type.types.length >= minMembers) {
        const memberTypes = node.type.types.map((m) => checker.getTypeFromTypeNode(m));
        const allObjects = memberTypes.every((t) =>
          (t.flags & ts.TypeFlags.Object) && t.getProperties().length > 0);
        if (allObjects && !hasDiscriminant(ts, checker, memberTypes)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.name.getStart());
          out.push({
            rule: 'prefer-discriminated-union', severity: 'info', file: rel(sf.fileName), line: line + 1,
            message: `La union "${node.name.text}" no tiene un campo discriminante literal común. Un discriminated union ('kind'/'type') hace el narrowing seguro.`,
          });
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  return out;
}
