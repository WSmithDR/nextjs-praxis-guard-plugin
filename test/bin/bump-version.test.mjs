import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '..', '..', 'bin', 'bump-version.py');

const root = mkdtempSync(join(tmpdir(), 'bv-'));
mkdirSync(join(root, '.claude-plugin'), { recursive: true });
mkdirSync(join(root, '.codex-plugin'), { recursive: true });
const claude = join(root, '.claude-plugin', 'plugin.json');
const codex = join(root, '.codex-plugin', 'plugin.json');
writeFileSync(claude, JSON.stringify({ name: 'x', version: '1.2.3' }, null, 2) + '\n');
writeFileSync(codex, JSON.stringify({ name: 'x', version: '0.1.0' }, null, 2) + '\n');
const ver = (p) => JSON.parse(readFileSync(p, 'utf8')).version;
const run = (...a) => execFileSync('python3', [script, '--root', root, ...a], { encoding: 'utf8' });

// --check: drift (codex 0.1.0 != claude 1.2.3) -> exit 1
let code = 0; try { run('--check'); } catch (e) { code = e.status; }
assert.equal(code, 1, '--check debe detectar drift');

// --sync: alinea codex al canónico (plugin.json)
run('--sync');
assert.equal(ver(codex), '1.2.3', 'sync alinea codex');
assert.equal(ver(claude), '1.2.3');

// patch: bumpea canónico y propaga a TODOS
run('patch');
assert.equal(ver(claude), '1.2.4');
assert.equal(ver(codex), '1.2.4', 'patch propaga a codex');

// --set: fija exacto en todos
run('--set', '2.0.0');
assert.equal(ver(claude), '2.0.0');
assert.equal(ver(codex), '2.0.0');

// minor / major
run('minor'); assert.equal(ver(claude), '2.1.0');
run('major'); assert.equal(ver(claude), '3.0.0'); assert.equal(ver(codex), '3.0.0');

// --check ahora OK -> no throw (exit 0)
run('--check');

console.log('bump-version.test ok');
