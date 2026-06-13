import { readFileSync } from 'node:fs';
import rule from '../../rules/untranslated-text.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };
const bad = readFileSync(new URL('../fixtures/untranslated-text/bad/Form.tsx', import.meta.url), 'utf8');
const good = readFileSync(new URL('../fixtures/untranslated-text/good/Form.tsx', import.meta.url), 'utf8');

const badF = rule(bad, 'Form.tsx', cfg);
assert.ok(badF.length >= 3, `expected >=3, got ${badF.length}: ${JSON.stringify(badF)}`);
assert.ok(badF.every((f) => f.rule === 'untranslated-text' && f.severity === 'warn'));
assert.ok(badF.some((f) => f.line), 'reports line numbers');
const msgs = badF.map((f) => f.message).join('\n');
assert.ok(/Nombre completo/.test(msgs), 'flags label text node');
assert.ok(/Enviar/.test(msgs), 'flags button text node');
assert.ok(/Escrib/.test(msgs), 'flags placeholder attribute');

// i18n-wrapped component is clean
assert.equal(rule(good, 'Form.tsx', cfg).length, 0,
  `expected 0 on good, got ${JSON.stringify(rule(good, 'Form.tsx', cfg))}`);

// only .tsx/.jsx in scope
assert.equal(rule(bad, 'data.ts', cfg).length, 0, 'non-component file ignored');

// interpolated text is fine
assert.equal(rule('<p>{label}</p>', 'x.tsx', cfg).length, 0, 'interpolated text ok');
assert.equal(rule('<p>{t("hi")}</p>', 'x.tsx', cfg).length, 0, 'i18n call ok');

// variable assignment with spaces is NOT a JSX attribute (no false positive)
assert.equal(rule('const title = "Hola mundo";', 'x.tsx', cfg).length, 0, 'assignment is not an attr');

// ignore list honored
assert.ok(
  rule(bad, 'Form.tsx', { enabled: true, ignore: ['Enviar'] }).every((f) => !/Enviar/.test(f.message)),
  'ignore list honored',
);

// disabled
assert.equal(rule(bad, 'Form.tsx', { enabled: false }).length, 0);
console.log('untranslated-text.test ok');
