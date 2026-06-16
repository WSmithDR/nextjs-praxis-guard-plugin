import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import rule from '../../rules/magic-literal-repeated.mjs';

const root = mkdtempSync(join(tmpdir(), 'mlr-'));
mkdirSync(join(root, 'src'), { recursive: true });
writeFileSync(join(root, 'src', 'a.ts'), 'const t = fetch("https://api.example.com");\n');
writeFileSync(join(root, 'src', 'b.ts'), 'const u = post("https://api.example.com");\n');
writeFileSync(join(root, 'src', 'c.ts'), 'const v = del("https://api.example.com");\n');

const tree = { files: ['src/a.ts', 'src/b.ts', 'src/c.ts'], dirs: new Set(['src']), root };
const full = { rules: { 'magic-literal-repeated': { enabled: true, minFiles: 3, minLen: 4 } } };

const out = rule(tree, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'magic-literal-repeated');
assert.match(out[0].message, /api\.example\.com/);

assert.equal(rule(tree, { rules: { 'magic-literal-repeated': { enabled: true, minFiles: 4 } } }).length, 0);
assert.equal(rule(tree, { rules: { 'magic-literal-repeated': { enabled: false } } }).length, 0);

console.log('magic-literal-repeated.test ok');
