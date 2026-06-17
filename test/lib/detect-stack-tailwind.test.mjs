import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack } from '../../lib/detect-stack.mjs';

// v3: config file -> tailwind + themeSource = el config
const v3 = mkdtempSync(join(tmpdir(), 'dstw3-'));
writeFileSync(join(v3, 'tailwind.config.js'), 'module.exports = {};');
const d3 = detectStack(v3);
assert.equal(d3.tailwind, true);
assert.ok(d3.tailwindConfigPath && d3.tailwindConfigPath.endsWith('tailwind.config.js'));
assert.ok(d3.tailwindThemeSource && d3.tailwindThemeSource.endsWith('tailwind.config.js'), `src=${d3.tailwindThemeSource}`);

// v4 CSS-only: tailwindcss en package.json + globals.css con @theme, SIN config
const v4 = mkdtempSync(join(tmpdir(), 'dstw4-'));
writeFileSync(join(v4, 'package.json'), JSON.stringify({ devDependencies: { tailwindcss: '^4.0.0' } }));
mkdirSync(join(v4, 'app'), { recursive: true });
writeFileSync(join(v4, 'app', 'globals.css'), '@import "tailwindcss";\n@theme { --color-brand: #1a1a1a; }');
const d4 = detectStack(v4);
assert.equal(d4.tailwind, true, 'detecta v4 por package.json');
assert.equal(d4.tailwindConfigPath, null, 'sin config file');
assert.ok(d4.tailwindThemeSource && d4.tailwindThemeSource.endsWith('globals.css'), `src=${d4.tailwindThemeSource}`);

// nada de tailwind -> false / null
const none = mkdtempSync(join(tmpdir(), 'dstw0-'));
const d0 = detectStack(none);
assert.equal(d0.tailwind, false);
assert.equal(d0.tailwindThemeSource, null);

// tailwindComponentLib desde package.json
const cva = mkdtempSync(join(tmpdir(), 'dscva-'));
writeFileSync(join(cva, 'package.json'), JSON.stringify({ dependencies: { 'class-variance-authority': '^0.7.0' } }));
assert.equal(detectStack(cva).tailwindComponentLib, 'cva');

const tv = mkdtempSync(join(tmpdir(), 'dstv-'));
writeFileSync(join(tv, 'package.json'), JSON.stringify({ devDependencies: { 'tailwind-variants': '^0.2.0' } }));
assert.equal(detectStack(tv).tailwindComponentLib, 'tailwind-variants');

// sin lib -> null (el fixture v4 de arriba no tiene cva/tv)
assert.equal(detectStack(v4).tailwindComponentLib, null);

// tailwindUsesApply: detecta @apply en un CSS convencional
const apply = mkdtempSync(join(tmpdir(), 'dsapply-'));
mkdirSync(join(apply, 'app'), { recursive: true });
writeFileSync(join(apply, 'app', 'globals.css'), '.btn { @apply px-4 py-2 rounded; }');
assert.equal(detectStack(apply).tailwindUsesApply, true);
// el v4 (solo @theme, sin @apply) -> false
assert.equal(detectStack(v4).tailwindUsesApply, false);

console.log('detect-stack-tailwind.test ok');
