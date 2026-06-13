import { readFileSync } from 'node:fs';
import secrets from '../../rules/secrets.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };
const bad = readFileSync(new URL('../fixtures/secrets/bad/keys.ts', import.meta.url), 'utf8');
const good = readFileSync(new URL('../fixtures/secrets/good/env.ts', import.meta.url), 'utf8');

const badFindings = secrets(bad, 'keys.ts', cfg);
assert.ok(badFindings.length >= 4, `expected >=4 findings, got ${badFindings.length}`);
assert.ok(badFindings.every((f) => f.rule === 'secrets' && f.severity === 'warn'));
assert.ok(badFindings.some((f) => f.line === 1), 'reports line numbers');

const goodFindings = secrets(good, 'env.ts', cfg);
assert.equal(goodFindings.length, 0, `expected 0 on good, got ${JSON.stringify(goodFindings)}`);
console.log('secrets.test ok');
