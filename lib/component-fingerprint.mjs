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

// Nombres de prop del primer parámetro destructurado: `({ label, value }) => …` -> {label,value}.
// Discrimina componentes de igual forma JSX pero datos distintos (un KpiCard {label,value} no es
// un DepositRow {deposito}); props completamente distintas bajan el score de similitud.
function propNames(ts, fnNode) {
  const props = new Set();
  const p = fnNode.parameters && fnNode.parameters[0];
  if (p && p.name && ts.isObjectBindingPattern(p.name)) {
    for (const el of p.name.elements) {
      if (el.name && ts.isIdentifier(el.name)) props.add(el.name.text);
    }
  }
  return props;
}

export function fingerprintComponent(ts, fnNode) {
  const elements = new Map();
  const hooks = new Set();
  const props = propNames(ts, fnNode);
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
  return { elements, hooks, props, size };
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
  // Si ninguno declara props destructuradas, no penalizamos (peso a estructura+hooks); si al menos
  // uno las declara, las props pesan y separan "misma forma JSX, datos distintos".
  const hasProps = (a.props && a.props.size) || (b.props && b.props.size);
  if (!hasProps) return 0.8 * weightedJaccard(a.elements, b.elements) + 0.2 * setJaccard(a.hooks, b.hooks);
  return 0.6 * weightedJaccard(a.elements, b.elements)
    + 0.2 * setJaccard(a.hooks, b.hooks)
    + 0.2 * setJaccard(a.props || new Set(), b.props || new Set());
}
