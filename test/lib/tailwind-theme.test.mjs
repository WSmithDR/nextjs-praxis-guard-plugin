import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTailwindTheme } from '../../lib/tailwind-theme.mjs';

const dir = mkdtempSync(join(tmpdir(), 'twtheme-'));
const cfgPath = join(dir, 'tailwind.config.js');
writeFileSync(cfgPath, `
module.exports = {
  theme: {
    spacing: { gutter: '1.5rem' },
    extend: {
      colors: { brand: '#1A1A1A', accent: { 500: '#abcdef', DEFAULT: '#fefefe' } },
      spacing: { sm: '0.5rem' },
    },
  },
};
`);
const theme = parseTailwindTheme(ts, cfgPath);
assert.ok(theme, 'esperaba theme');
assert.equal(theme.colors.get('#1a1a1a'), 'brand', 'hex normalizado a minúsculas');
assert.equal(theme.colors.get('#abcdef'), 'accent-500', 'anidado -> accent-500');
assert.equal(theme.colors.get('#fefefe'), 'accent', 'DEFAULT -> accent');
assert.equal(theme.spacing.get('0.5rem'), 'sm');
assert.equal(theme.spacing.get('1.5rem'), 'gutter', 'theme.spacing además de extend');

const cfg2 = join(dir, 'tw2.js');
writeFileSync(cfg2, `const cfg = { theme: { extend: { colors: { x: '#000000' } } } }; export default cfg;`);
assert.equal(parseTailwindTheme(ts, cfg2).colors.get('#000000'), 'x');

const cfg3 = join(dir, 'tw3.js'); writeFileSync(cfg3, 'module.exports = {};');
const t3 = parseTailwindTheme(ts, cfg3);
assert.equal(t3.colors.size, 0);
assert.equal(parseTailwindTheme(ts, join(dir, 'nope.js')), null);

console.log('tailwind-theme.test ok');
