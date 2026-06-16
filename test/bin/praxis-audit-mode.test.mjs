import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');
function git(dir, args) { return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); }
function readMeta(dir) { return JSON.parse(readFileSync(join(dir, '.praxis-guard', 'meta.json'), 'utf8')); }

const dir = mkdtempSync(join(tmpdir(), 'praxis-audit-mode-'));
try {
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@t.t']);
  git(dir, ['config', 'user.name', 't']);
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { secrets: { enabled: true } } }));
  writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;');
  git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'init']);

  // 1ª corrida: sin meta -> full -> estampa last_audited_commit + fingerprint
  let r = spawnSync('node', [AUDIT, '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const meta1 = readMeta(dir);
  assert.ok(meta1.last_audited_commit, 'estampa last_audited_commit tras full');
  assert.ok(meta1.rules_fingerprint, 'estampa fingerprint');

  // agregar un archivo con secreto y commitear
  writeFileSync(join(dir, 'src', 'leak.ts'), 'const k = "sk_live_0123456789abcdef";');
  git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'leak']);

  // 2ª corrida: misma versión+fingerprint -> incremental -> audita solo el diff (leak.ts)
  r = spawnSync('node', [AUDIT, '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /leak\.ts/, 'incremental detecta el archivo nuevo');
  assert.match(r.stdout, /modo incremental/, 'reporta modo incremental');
  console.log('praxis-audit-mode.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
