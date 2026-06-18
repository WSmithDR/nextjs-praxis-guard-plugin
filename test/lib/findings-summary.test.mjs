import { summarizeFindings } from '../../lib/findings.mjs';
import assert from 'node:assert/strict';

assert.equal(summarizeFindings([]), '', 'vacío -> ""');

const findings = [
  { rule: 'secrets', severity: 'error', file: 'a.ts' },
  { rule: 'hardcoded-data', severity: 'warn', file: 'a.ts' },
  { rule: 'hardcoded-data', severity: 'warn', file: 'b.ts' },
  { rule: 'hardcoded-data', severity: 'info', file: 'b.ts' },
  { rule: 'untranslated-text', severity: 'info' },  // sin file -> (proyecto)
];
const out = summarizeFindings(findings);

assert.ok(out.includes('── Resumen ──'), 'tiene header');
// severidad ordenada error > warn > info
assert.ok(/Severidad: error: 1\s+warn: 2\s+info: 2/.test(out), `severidad: ${out}`);
// por regla, ordenado por conteo desc (hardcoded-data:3 primero)
const ruleIdx = out.indexOf('hardcoded-data');
assert.ok(ruleIdx > -1 && out.indexOf('secrets') > ruleIdx, 'hardcoded-data antes que secrets');
// top archivos
assert.ok(out.includes('Top archivos'), 'lista top archivos');
assert.ok(out.includes('(proyecto)'), 'finding sin file cae en (proyecto)');

// topFiles recorta y lo anuncia
const many = Array.from({ length: 15 }, (_, i) => ({ rule: 'r', severity: 'info', file: `f${i}.ts` }));
const cut = summarizeFindings(many, { topFiles: 10 });
assert.ok(cut.includes('Top archivos (10 de 15)'), 'anuncia el recorte');

console.log('findings-summary.test ok');
