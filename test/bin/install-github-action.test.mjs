import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const installer = join(repo, 'bin', 'install-hooks.mjs');

const target = mkdtempSync(join(tmpdir(), 'gha-'));
execFileSync('node', [installer, '--cli', 'github-action', '--target', target], { encoding: 'utf8' });

const wf = join(target, '.github', 'workflows', 'praxis-audit.yml');
assert.ok(existsSync(wf), 'esperaba el workflow generado');
const body = readFileSync(wf, 'utf8');
assert.ok(!body.includes('__PLUGIN_URL__'), 'placeholder URL sin reemplazar');
assert.ok(!body.includes('__PLUGIN_REF__'), 'placeholder REF sin reemplazar');
// la URL del clone debe ser CI-cloneable (HTTPS), no SSH (el runner no tiene key).
assert.ok(!/git@/.test(body), 'la URL no debe ser SSH (git@...)');
assert.ok(/https:\/\/|<PLUGIN_GIT_URL>/.test(body), 'la URL debe ser HTTPS');
assert.ok(body.includes('praxis-audit.mjs'), 'debe invocar el motor');
assert.ok(body.includes('--format sarif'), 'debe usar SARIF');
assert.ok(body.includes('upload-sarif'), 'debe subir el SARIF');

console.log('install-github-action.test ok');
