// rules/excessive-usestate.mjs
// Avisa cuando un componente acumula muchos useState. Un puñado de useState sueltos suele
// pedir consolidación: un objeto de estado único, useReducer, o un custom hook que encapsule
// la lógica. Reduce re-renders sutiles y hace el estado del componente legible de un vistazo.
//
// Heurística determinista: cuenta los call-sites de useState en el archivo. Como el plugin ya
// empuja `single-component-per-file`, el conteo por archivo ≈ por componente.
// ponytail: cuenta por archivo, no por componente (sin AST). Si un archivo tiene 2 componentes
// con 2 useState c/u, los suma; raro dado single-component-per-file. Upgrade: contar por
// función vía TS (--deep). Tampoco mira custom hooks en .ts (solo .tsx/.jsx).
const USESTATE = /\buseState\s*[(<]/g;   // matchea useState( y useState<T>(, no el import `{ useState }`

export default function excessiveUsestate(content, filePath = '', config = {}) {
  if (config.enabled === false) return [];
  if (!/\.(tsx|jsx)$/.test(String(filePath))) return [];
  const max = config.max ?? 3;   // permite hasta `max`; avisa al superarlo (default: avisa con 4+)

  const idxs = [];
  let m;
  USESTATE.lastIndex = 0;
  while ((m = USESTATE.exec(content)) !== null) idxs.push(m.index);
  if (idxs.length <= max) return [];

  const lineOf = (idx) => content.slice(0, idx).split('\n').length;
  // apuntar al primer useState que excede el presupuesto (el que cruza el umbral).
  return [{
    rule: 'excessive-usestate', line: lineOf(idxs[max]), severity: 'info',
    message: `${idxs.length} useState en el componente (máx sugerido: ${max}). Considerá consolidar el estado: un objeto único + un setter, useReducer, o un custom hook que encapsule la lógica.`,
  }];
}
