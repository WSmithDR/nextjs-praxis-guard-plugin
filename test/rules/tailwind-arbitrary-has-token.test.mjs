import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import rule from '../../rules/tailwind-arbitrary-has-token.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfgPath = join(here, '..', 'fixtures', 'ast', 'tw-has-token', 'tailwind.config.js');
const ctx = await buildContextFor('tw-has-token');
const full = { detected: { tailwind: true, tailwindThemeSource: cfgPath },
               rules: { 'tailwind-arbitrary-has-token': { enabled: true } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'tailwind-arbitrary-has-token');
assert.match(out[0].message, /bg-brand/);
assert.ok(out[0].file.endsWith('ui.tsx'), `file=${out[0].file}`);

assert.equal(rule(ctx, { ...full, rules: { 'tailwind-arbitrary-has-token': { enabled: false } } }).length, 0);
assert.equal(rule(ctx, { detected: {}, rules: { 'tailwind-arbitrary-has-token': { enabled: true } } }).length, 0);
console.log('tailwind-arbitrary-has-token.test ok');
