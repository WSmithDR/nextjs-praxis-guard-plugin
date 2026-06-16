import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const audit = join(repo, 'bin', 'praxis-audit.mjs');

const proj = mkdtempSync(join(tmpdir(), 'sarif-'));
cpSync(join(here, '..', 'fixtures', 'sarif-project'), proj, { recursive: true });

// 1. --format sarif -> stdout es SARIF válido con el finding stringly-typed.
const out = execFileSync('node', [audit, '--full', '--format', 'sarif', '--dir', proj], { encoding: 'utf8' });
const sarif = JSON.parse(out);
assert.equal(sarif.version, '2.1.0');
assert.ok(sarif.runs[0].results.some((r) => r.ruleId === 'stringly-typed'), 'esperaba finding stringly-typed');

// 2. --gate con minSeverity info -> exit 1, y el SARIF igual sale por stdout.
let code = 0, gateOut = '';
try { gateOut = execFileSync('node', [audit, '--full', '--format', 'sarif', '--gate', '--dir', proj], { encoding: 'utf8' }); }
catch (e) { code = e.status; gateOut = e.stdout; }
assert.equal(code, 1, 'gate debe frenar (exit 1)');
JSON.parse(gateOut);

console.log('praxis-audit-sarif.test ok');
