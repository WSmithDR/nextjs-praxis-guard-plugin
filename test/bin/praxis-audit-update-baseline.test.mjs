import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-updbl-'));
try {
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { secrets: { enabled: true } } }));
  writeFileSync(join(dir, 'src', 'leak.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef";');

  const r = spawnSync('node', [AUDIT, '--update-baseline', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /baseline actualizada/);
  assert.ok(existsSync(join(dir, '.praxis-guard', 'baseline.json')), 'escribió baseline.json');
  const bl = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'baseline.json'), 'utf8'));
  assert.ok(bl.fingerprints.length >= 1, 'capturó al menos 1 huella');
  console.log('praxis-audit-update-baseline.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
