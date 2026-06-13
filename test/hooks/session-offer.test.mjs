import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const SCRIPT = new URL('../../hooks/praxis-session-offer.mjs', import.meta.url).pathname;
function run(cwd) { return execFileSync('node', [SCRIPT], { cwd, encoding: 'utf8' }); }

const dir = mkdtempSync(join(tmpdir(), 'praxis-next-'));
writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '14.0.0' } }));
assert.ok(/praxis-config/.test(run(dir)), 'offers setup');
assert.equal(run(dir).trim(), '', 'silent after first offer');

const plain = mkdtempSync(join(tmpdir(), 'praxis-plain-'));
writeFileSync(join(plain, 'package.json'), JSON.stringify({ dependencies: {} }));
assert.equal(run(plain).trim(), '', 'silent on non-next');

const configured = mkdtempSync(join(tmpdir(), 'praxis-cfg-'));
writeFileSync(join(configured, 'package.json'), JSON.stringify({ dependencies: { next: '14' } }));
mkdirSync(join(configured, '.praxis-guard'));
writeFileSync(join(configured, '.praxis-guard', 'config.json'), '{}');
assert.equal(run(configured).trim(), '', 'silent when configured');

[dir, plain, configured].forEach((d) => rmSync(d, { recursive: true, force: true }));
console.log('session-offer.test ok');
