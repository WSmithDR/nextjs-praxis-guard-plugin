// rules/prefer-branded-type.mjs
// AST rule (experimental, default off): `type X = string|number|bigint` cuyo nombre sugiere
// identidad (*Id/*Token/*Key/…) -> sugerir branded type (protección nominal).
export const meta = { kind: 'ast' };

export default function preferBrandedType(ctx, full = {}) {
  const cfg = (full.rules && full.rules['prefer-branded-type']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.checker) return [];
  let pattern;
  try { pattern = new RegExp(cfg.pattern || '(Id|Token|Key|Uuid|Hash)$'); }
  catch { pattern = /(Id|Token|Key|Uuid|Hash)$/; }
  const { ts, sourceFiles, rel } = ctx;
  const PRIMS = new Set([ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.BigIntKeyword]);

  const out = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isTypeAliasDeclaration(node) && node.name && node.type
          && PRIMS.has(node.type.kind) && pattern.test(node.name.text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.name.getStart());
        out.push({
          rule: 'prefer-branded-type', severity: 'info', file: rel(sf.fileName), line: line + 1,
          message: `El alias "${node.name.text}" es un primitivo sin protección nominal. Un branded type (${node.name.text} & { __brand: '${node.name.text}' }) evita mezclar identificadores.`,
        });
      }
      ts.forEachChild(node, visit);
    });
  }
  return out;
}
