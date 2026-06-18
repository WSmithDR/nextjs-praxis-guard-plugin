import rule from '../../rules/tailwind-content-coverage.mjs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const bad = fileURLToPath(new URL('../fixtures/tailwind-content-coverage/bad.tailwind.config.js', import.meta.url));
const good = fileURLToPath(new URL('../fixtures/tailwind-content-coverage/good.tailwind.config.js', import.meta.url));
const tree = { root: '/tmp', files: [] };
const arch = { strategy: 'by-feature', featuresDir: 'src/features', sharedDirs: ['src/shared'] };
const full = (twPath, ruleCfg = { enabled: true }) => ({ architecture: arch, detected: { tailwindConfigPath: twPath }, rules: { 'tailwind-content-coverage': ruleCfg } });

// content solo app/** -> no cubre src/features ni src/shared -> 2 warns
const r = rule(tree, full(bad));
assert.equal(r.length, 2, `esperaba 2, got ${r.length}`);
assert.ok(r.every((f) => f.rule === 'tailwind-content-coverage' && f.severity === 'warn'));
assert.ok(r.some((f) => /src\/features/.test(f.message)) && r.some((f) => /src\/shared/.test(f.message)));

// content src/** -> cubre ambos -> 0
assert.equal(rule(tree, full(good)).length, 0, 'src/** cubre features y shared');

// sin strategy declarada -> no corre
assert.equal(rule(tree, { architecture: { strategy: null }, detected: { tailwindConfigPath: bad }, rules: {} }).length, 0);
// sin tailwind.config -> no corre
assert.equal(rule(tree, full(null)).length, 0);
// disabled
assert.equal(rule(tree, full(bad, { enabled: false })).length, 0);
console.log('tailwind-content-coverage.test ok');
