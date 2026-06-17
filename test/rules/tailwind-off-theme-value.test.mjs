import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import rule from '../../rules/tailwind-off-theme-value.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfgPath = join(here, '..', 'fixtures', 'ast', 'tw-off-theme', 'tailwind.config.js');
const ctx = await buildContextFor('tw-off-theme');
const full = { detected: { tailwind: true, tailwindThemeSource: cfgPath },
               rules: { 'tailwind-off-theme-value': { enabled: true } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'tailwind-off-theme-value');
assert.match(out[0].message, /#999999/);

assert.equal(rule(ctx, { ...full, rules: { 'tailwind-off-theme-value': { enabled: false } } }).length, 0);
console.log('tailwind-off-theme-value.test ok');
