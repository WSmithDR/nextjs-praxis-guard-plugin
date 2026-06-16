// lib/tailwind-theme.mjs
// Parsea (estáticamente, SIN ejecutar) el tailwind.config.* y extrae los tokens del theme
// declarados por el proyecto: { colors: Map<valor, nombre>, spacing: Map<valor, nombre> } | null.
import { readFileSync } from 'node:fs';
import { normalizeColor } from './tailwind-classes.mjs';

function unwrap(ts, e) {
  while (e && (ts.isAsExpression(e) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))) e = e.expression;
  return e;
}
function propName(ts, p) {
  const n = p.name;
  if (n && (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n))) return n.text;
  return null;
}
function getObjProp(ts, objLit, name) {
  if (!objLit) return null;
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p) && propName(ts, p) === name && ts.isObjectLiteralExpression(p.initializer)) return p.initializer;
  }
  return null;
}

function findConfigObject(ts, sf) {
  const named = new Map();
  let exportExpr = null;
  for (const node of sf.statements) {
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (d.name && ts.isIdentifier(d.name) && d.initializer) named.set(d.name.text, unwrap(ts, d.initializer));
      }
    } else if (ts.isExportAssignment(node)) {
      exportExpr = unwrap(ts, node.expression);
    } else if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
        && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(node.expression.left)
        && node.expression.left.expression.getText() === 'module'
        && node.expression.left.name.text === 'exports') {
      exportExpr = unwrap(ts, node.expression.right);
    }
  }
  if (!exportExpr) return null;
  if (ts.isObjectLiteralExpression(exportExpr)) return exportExpr;
  if (ts.isIdentifier(exportExpr)) {
    const v = named.get(exportExpr.text);
    return v && ts.isObjectLiteralExpression(v) ? v : null;
  }
  return null;
}

function extractScale(ts, objLit, normalize) {
  const map = new Map();
  if (!objLit) return map;
  for (const p of objLit.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = propName(ts, p); if (key == null) continue;
    const init = p.initializer;
    if (ts.isStringLiteral(init)) {
      map.set(normalize(init.text), key);
    } else if (ts.isObjectLiteralExpression(init)) {
      for (const q of init.properties) {
        if (!ts.isPropertyAssignment(q) || !ts.isStringLiteral(q.initializer)) continue;
        const sub = propName(ts, q); if (sub == null) continue;
        map.set(normalize(q.initializer.text), sub === 'DEFAULT' ? key : `${key}-${sub}`);
      }
    }
  }
  return map;
}

export function parseTailwindTheme(ts, configPath) {
  let text;
  try { text = readFileSync(configPath, 'utf8'); } catch { return null; }
  let sf;
  try { sf = ts.createSourceFile(configPath, text, ts.ScriptTarget.Latest, true); } catch { return null; }
  const cfg = findConfigObject(ts, sf);
  if (!cfg) return null;
  const theme = getObjProp(ts, cfg, 'theme');
  if (!theme) return { colors: new Map(), spacing: new Map() };
  const extend = getObjProp(ts, theme, 'extend');
  const trim = (v) => v.trim();
  const colors = new Map([
    ...extractScale(ts, getObjProp(ts, theme, 'colors'), normalizeColor),
    ...extractScale(ts, getObjProp(ts, extend, 'colors'), normalizeColor),
  ]);
  const spacing = new Map([
    ...extractScale(ts, getObjProp(ts, theme, 'spacing'), trim),
    ...extractScale(ts, getObjProp(ts, extend, 'spacing'), trim),
  ]);
  return { colors, spacing };
}
