// lib/ast-shapes.mjs
// Helpers puros para extraer y comparar "formas" de tipos con el type-checker.

// Map<propName, typeString> de un tipo. `enclosing` es un nodo de fallback
// para resolver el tipo de cada símbolo.
export function shapeOf(ts, checker, type, enclosing) {
  const shape = new Map();
  for (const sym of checker.getPropertiesOfType(type)) {
    const decl = sym.valueDeclaration || (sym.declarations && sym.declarations[0]) || enclosing;
    let t = null;
    try { t = checker.getTypeOfSymbolAtLocation(sym, decl); } catch { t = null; }
    shape.set(sym.getName(), t ? checker.typeToString(t) : 'unknown');
  }
  return shape;
}

// Set<propName> de un tipo (sin los tipos, solo nombres).
export function shapeNames(ts, checker, type) {
  const names = new Set();
  for (const sym of checker.getPropertiesOfType(type)) names.add(sym.getName());
  return names;
}

// ¿`big` contiene TODAS las entradas (name+type) de `small` y es estrictamente mayor?
export function isSuperset(big, small) {
  if (big.size <= small.size) return false;
  for (const [k, v] of small) if (big.get(k) !== v) return false;
  return true;
}

// ¿misma forma exacta (mismas keys y tipos)?
export function sameShape(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

// ¿mismos nombres (Sets)?
export function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

// Utility types que reshapean un tipo existente: un alias así YA es reuso correcto.
const DERIVED_UTILITIES = new Set(['Pick', 'Omit', 'Partial', 'Required', 'Readonly', 'Exclude', 'Extract']);

// ¿el type alias ya está derivado de otro tipo? (`Pick`/`Omit`/... o `z.infer<...>`).
// Esos no hay que volver a "sugerir derivar": son la forma correcta, no una duplicación.
// Las interfaces nunca cuentan como derivadas. Es un chequeo AST puro (no requiere resolver tipos).
export function isDerivedAlias(ts, node) {
  if (!node || !ts.isTypeAliasDeclaration(node) || !node.type) return false;
  const t = node.type;
  if (!ts.isTypeReferenceNode(t)) return false;
  const name = t.typeName;
  if (ts.isQualifiedName(name)) return !!(name.right && name.right.text === 'infer'); // z.infer<...>
  if (ts.isIdentifier(name)) return name.text === 'infer' || DERIVED_UTILITIES.has(name.text);
  return false;
}

// Recolecta toda declaración de tipo con nombre (interface/type alias) cuyo shape
// tiene >= minProps props. Orden estable por (file, name) para tie-breaks deterministas.
// Cada entrada lleva `derived` (true si el alias ya es un Pick/Omit/z.infer de otro).
export function collectNamedShapes(ctx, minProps) {
  const { ts, checker, sourceFiles, rel } = ctx;
  const decls = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) {
        const shape = shapeOf(ts, checker, checker.getTypeAtLocation(node.name), node);
        if (shape.size >= minProps) {
          const { line } = sf.getLineAndCharacterOfPosition(node.name.getStart());
          decls.push({ name: node.name.text, file: rel(sf.fileName), line: line + 1, shape, derived: isDerivedAlias(ts, node) });
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  decls.sort((a, b) => (a.file === b.file ? a.name.localeCompare(b.name) : a.file.localeCompare(b.file)));
  return decls;
}
