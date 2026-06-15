import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'praxis-session-offer.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-drift-'));
try {
  // proyecto Next con config y meta que solo revisó 'secrets' -> faltan reglas -> drift
  writeFileSync(join(dir, 'next.config.js'), 'module.exports = {};');
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), '{}');
  writeFileSync(join(dir, '.praxis-guard', 'meta.json'), JSON.stringify({ reviewed_rules: ['secrets'] }));

  const r = spawnSync('node', [HOOK], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: dir, TMPDIR: dir } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /regla/i, 'avisa de reglas nuevas/no revisadas');
  console.log('session-offer-drift.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
