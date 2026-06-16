import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-audit-'));
try {
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({
    rules: { secrets: { enabled: true } }
  }));
  writeFileSync(join(dir, 'src', 'leak.ts'), 'const k = "sk_live_0123456789abcdef";');

  const r = spawnSync('node', [AUDIT, '--full', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, `exit 0, got ${r.status}: ${r.stderr}`);
  assert.match(r.stdout, /leak\.ts/, 'el reporte menciona el archivo con finding');
  console.log('praxis-audit full.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
