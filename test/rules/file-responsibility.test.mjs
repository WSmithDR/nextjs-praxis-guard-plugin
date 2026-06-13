import { readFileSync } from 'node:fs';
import rule from '../../rules/file-responsibility.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, maxLines: 400, mixedSignalsLines: 200 };
const big = readFileSync(new URL('../fixtures/file-responsibility/bad/big.tsx', import.meta.url), 'utf8');
const clean = readFileSync(new URL('../fixtures/file-responsibility/good/clean.tsx', import.meta.url), 'utf8');

const bigF = rule(big, 'big.tsx', cfg);
assert.ok(bigF.some((f) => f.message.includes('líneas')), 'flags line count');
assert.ok(bigF.some((f) => /responsabilidad/i.test(f.message)), 'mixed-signals nudge');
assert.ok(bigF.every((f) => f.rule === 'file-responsibility'));

assert.equal(rule(clean, 'clean.tsx', cfg).length, 0, 'small clean file is fine');
console.log('file-responsibility.test ok');
