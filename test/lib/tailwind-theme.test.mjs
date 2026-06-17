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

// robustez: spreads, funciones y require en el theme se saltean sin romper; solo sobrevive el literal.
const cfg4 = join(dir, 'tw4.js');
writeFileSync(cfg4, `const base = require('x');
module.exports = { theme: { extend: { colors: { ...base, ok: '#123456', fn: () => '#000' } } } };`);
const t4 = parseTailwindTheme(ts, cfg4);
assert.equal(t4.colors.get('#123456'), 'ok', 'sobrevive el literal');
assert.equal(t4.colors.size, 1, 'spread/función se saltearon');

// v4: theme en CSS (@theme). `ts` se pasa pero el branch CSS no lo usa.
const cssPath = join(dir, 'globals.css');
writeFileSync(cssPath, `@import "tailwindcss";
@theme {
  --color-brand: #1A1A1A;
  --color-accent-500: #abcdef;
  --spacing-sm: 0.5rem
}`);
const tcss = parseTailwindTheme(ts, cssPath);
assert.ok(tcss, 'esperaba theme del CSS');
assert.equal(tcss.colors.get('#1a1a1a'), 'brand', 'hex normalizado, token v4 = brand');
assert.equal(tcss.colors.get('#abcdef'), 'accent-500');
assert.equal(tcss.spacing.get('0.5rem'), 'sm', 'última decl sin ; igual se parsea');

console.log('tailwind-theme.test ok');
