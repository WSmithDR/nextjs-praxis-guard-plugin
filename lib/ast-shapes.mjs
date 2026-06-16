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
