import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INSTALL = join(PLUGIN_ROOT, 'bin', 'install-hooks.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-precommit-'));
try {
  spawnSync('git', ['init', '-q'], { cwd: dir });
  const r = spawnSync('node', [INSTALL, '--target', dir, '--cli', 'precommit'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const hook = join(dir, '.git', 'hooks', 'pre-commit');
  assert.ok(existsSync(hook), 'pre-commit instalado');
  const body = readFileSync(hook, 'utf8');
  assert.match(body, /praxis-audit\.mjs/);
  assert.match(body, /--staged/);
  assert.ok((statSync(hook).mode & 0o111) !== 0, 'pre-commit es ejecutable');
  console.log('install-hooks precommit.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
