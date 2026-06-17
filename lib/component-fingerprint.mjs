// lib/component-fingerprint.mjs
// Fingerprint estructural de un componente React (multiset de tipos de elemento JSX + hooks)
// y similitud (Jaccard ponderado). Parser-only, no ejecuta nada.

function hasJsx(ts, node) {
  let found = false;
  (function visit(n) {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) { found = true; return; }
    ts.forEachChild(n, visit);
  })(node);
  return found;
}

export function extractComponents(ts, sf) {
  const out = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body && hasJsx(ts, st)) out.push({ name: st.name.text, fnNode: st });
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (d.name && ts.isIdentifier(d.name) && d.initializer
            && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) && hasJsx(ts, d.initializer)) {
          out.push({ name: d.name.text, fnNode: d.initializer });
        }
      }
    }
  }
  return out;
}

export function fingerprintComponent(ts, fnNode) {
  const elements = new Map();
  const hooks = new Set();
  let size = 0;
  (function visit(n) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText();
      elements.set(tag, (elements.get(tag) || 0) + 1);
      size++;
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^use[A-Z]/.test(n.expression.text)) hooks.add(n.expression.text);
    ts.forEachChild(n, visit);
  })(fnNode);
  return { elements, hooks, size };
}

function weightedJaccard(a, b) {
  const tags = new Set([...a.keys(), ...b.keys()]);
  if (!tags.size) return 1;
  let inter = 0, uni = 0;
  for (const t of tags) { const x = a.get(t) || 0, y = b.get(t) || 0; inter += Math.min(x, y); uni += Math.max(x, y); }
  return uni ? inter / uni : 1;
}
function setJaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  const uni = new Set([...a, ...b]).size;
  return uni ? inter / uni : 1;
}

export function similarity(a, b) {
  return 0.8 * weightedJaccard(a.elements, b.elements) + 0.2 * setJaccard(a.hooks, b.hooks);
}
