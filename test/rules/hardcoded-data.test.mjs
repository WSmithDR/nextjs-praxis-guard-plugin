import { readFileSync } from 'node:fs';
import rule from '../../rules/hardcoded-data.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, minElements: 8 };
const bad = readFileSync(new URL('../fixtures/hardcoded-data/bad/list.tsx', import.meta.url), 'utf8');
const good = readFileSync(new URL('../fixtures/hardcoded-data/good/small.tsx', import.meta.url), 'utf8');

const badF = rule(bad, 'list.tsx', cfg);
assert.equal(badF.length, 1, `expected 1, got ${badF.length}`);
assert.equal(badF[0].rule, 'hardcoded-data');
assert.equal(badF[0].line, 1);

assert.equal(rule(good, 'small.tsx', cfg).length, 0, 'small array is fine');
assert.equal(rule(bad, 'data.ts', cfg).length, 0, 'non-component file ignored');
console.log('hardcoded-data.test ok');
