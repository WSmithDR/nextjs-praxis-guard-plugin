import { formatFindings } from '../../lib/findings.mjs';
import assert from 'node:assert/strict';

const findings = [
  { rule: 'secrets', line: 12, message: 'API key hardcodeada.', severity: 'warn' },
  { rule: 'file-responsibility', message: '437 líneas (umbral 400).', severity: 'info' },
];

const out = formatFindings(findings, 'app/page.tsx');
assert.ok(out.includes('praxis-guard'), 'has banner');
assert.ok(out.includes('app/page.tsx'), 'has file path');
assert.ok(out.includes('secrets:12'), 'rule + line');
assert.ok(out.includes('[warn]') && out.includes('[info]'), 'severities');
assert.equal(formatFindings([], 'x.tsx'), '', 'empty findings -> empty string');
console.log('findings.test ok');
