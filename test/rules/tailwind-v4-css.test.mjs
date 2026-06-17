import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import rule from '../../rules/tailwind-arbitrary-has-token.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, '..', 'fixtures', 'ast', 'tw-v4', 'globals.css');
const ctx = await buildContextFor('tw-v4');
const full = { detected: { tailwind: true, tailwindThemeSource: cssPath },
               rules: { 'tailwind-arbitrary-has-token': { enabled: true } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.match(out[0].message, /bg-brand/);
console.log('tailwind-v4-css.test ok');
