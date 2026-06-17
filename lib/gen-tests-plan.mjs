// lib/gen-tests-plan.mjs
// Motor determinista del generador de tests: framework + ruta + firma del componente -> PLAN.
// No ejecuta código del proyecto: package.json (JSON) + ts.createSourceFile (parser).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename, extname, relative } from 'node:path';

function readPkg(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { return null; }
}
function existsAny(dir, names) { return names.some((n) => existsSync(join(dir, n))); }

export function detectTestFramework(projectDir) {
  const pkg = readPkg(projectDir);
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);
  const usesRTL = has('@testing-library/react');
  let framework;
  if (has('vitest') || existsAny(projectDir, ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs'])) framework = 'vitest';
  else if (has('jest') || existsAny(projectDir, ['jest.config.ts', 'jest.config.js', 'jest.config.cjs', 'jest.config.json'])) framework = 'jest';
  else framework = 'node:test';
  let testImport;
  if (framework === 'vitest') testImport = "import { describe, it, expect } from 'vitest';";
  else if (framework === 'jest') testImport = "import { describe, it, expect } from '@jest/globals';";
  else testImport = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';";
  if (usesRTL) testImport += "\nimport { render, screen } from '@testing-library/react';";
  return { framework, testImport, usesRTL };
}

export function resolveTestPath(projectDir, targetFile) {
  const dir = dirname(targetFile);
  const ext = extname(targetFile);
  const name = basename(targetFile, ext);
  const testsDir = join(dir, '__tests__');
  const testFilePath = existsSync(testsDir) ? join(testsDir, `${name}.test${ext}`) : join(dir, `${name}.test${ext}`);
  return { testFilePath, exists: existsSync(testFilePath) };
}

function membersToProps(ts, members) {
  const out = [];
  for (const m of members) {
    if (ts.isPropertySignature(m) && m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) {
      out.push({ name: m.name.text, type: m.type ? m.type.getText() : 'unknown' });
    }
  }
  return out;
}
function propsFromParam(ts, param, interfaces) {
  const t = param && param.type;
  if (!t) return [];
  if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName)) {
    const members = interfaces.get(t.typeName.text);
    return members ? membersToProps(ts, members) : [];
  }
  if (ts.isTypeLiteralNode(t)) return membersToProps(ts, t.members);
  return [];
}

export function extractComponentSignature(ts, targetFile) {
  let text;
  try { text = readFileSync(targetFile, 'utf8'); } catch { return null; }
  const sf = ts.createSourceFile(targetFile, text, ts.ScriptTarget.Latest, true);
  const isTsx = /\.(tsx|jsx)$/.test(targetFile);
  const interfaces = new Map();
  let best = null;
  const record = (name, kind, fnNode) => {
    if (!best || kind === 'default') best = { name, exportKind: kind, fnNode };
  };
  for (const st of sf.statements) {
    if (ts.isInterfaceDeclaration(st) && st.name) interfaces.set(st.name.text, st.members);
    if (ts.isTypeAliasDeclaration(st) && st.name && ts.isTypeLiteralNode(st.type)) interfaces.set(st.name.text, st.type.members);
    const mods = st.modifiers || [];
    const isExport = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(st) && isExport && st.name) record(st.name.text, isDefault ? 'default' : 'named', st);
    if (ts.isVariableStatement(st) && isExport) {
      for (const d of st.declarationList.declarations) {
        if (d.name && ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          record(d.name.text, 'named', d.initializer);
        }
      }
    }
    if (ts.isExportAssignment(st) && !st.isExportEquals) {
      const e = st.expression;
      if (ts.isIdentifier(e)) record(e.text, 'default', null);
      else if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) record(basename(targetFile, extname(targetFile)), 'default', e);
    }
  }
  if (!best) return null;
  const fn = best.fnNode;
  let props = (fn && fn.parameters && fn.parameters.length) ? propsFromParam(ts, fn.parameters[0], interfaces) : [];
  // Fallback: si el primer parámetro no es un "props bag" (type literal o interface),
  // tomamos los parámetros posicionales por nombre (funciones util como add(a, b)).
  if (!props.length && fn && fn.parameters && fn.parameters.length) {
    props = [];
    for (const param of fn.parameters) {
      if (param.name && ts.isIdentifier(param.name)) {
        props.push({ name: param.name.text, type: param.type ? param.type.getText() : 'unknown' });
      }
    }
  }
  const isReactComponent = isTsx && /^[A-Z]/.test(best.name) && !!fn;
  return { name: best.name, exportKind: best.exportKind, isReactComponent, props };
}

export function buildTestPlan(ts, projectDir, targetFile) {
  const fw = detectTestFramework(projectDir);
  const { testFilePath, exists } = resolveTestPath(projectDir, targetFile);
  const component = ts ? extractComponentSignature(ts, targetFile) : null;
  const hints = [];
  if (component) {
    hints.push(component.isReactComponent ? 'render/smoke test del componente' : 'llamá la función y assert el retorno');
    for (const p of component.props) {
      hints.push(/^on[A-Z]/.test(p.name) ? `simular ${p.name} y assert el efecto` : `probar la prop ${p.name}`);
    }
  }
  return {
    targetFile: relative(projectDir, targetFile),
    framework: fw.framework, testImport: fw.testImport, usesRTL: fw.usesRTL,
    testFilePath: relative(projectDir, testFilePath), exists,
    component, hints,
  };
}
