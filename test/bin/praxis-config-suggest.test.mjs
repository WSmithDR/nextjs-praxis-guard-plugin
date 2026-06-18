import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const BIN = resolve('bin/praxis-config.mjs');
const dir = mkdtempSync(join(tmpdir(), 'pc-sug-'));
mkdirSync(join(dir, '.todo'));
mkdirSync(join(dir, 'src'));
writeFileSync(join(dir, 'src', 'a.tsx'), '');

const out = execFileSync('node', [BIN, 'suggest-excludes', '--dir', dir], { encoding: 'utf8' });
const parsed = JSON.parse(out);
assert.ok(Array.isArray(parsed.candidates), 'candidates es array');
assert.ok(parsed.candidates.includes('.todo'), `candidates=${JSON.stringify(parsed.candidates)}`);
assert.ok(!parsed.candidates.includes('src'), 'src no se sugiere');

console.log('praxis-config-suggest.test ok');
