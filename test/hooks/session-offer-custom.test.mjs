import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'praxis-session-offer.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-custom-drift-'));
try {
  writeFileSync(join(dir, 'next.config.js'), 'module.exports = {};');
  mkdirSync(join(dir, '.praxis-guard', 'rules'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), '{}');
  writeFileSync(join(dir, '.praxis-guard', 'rules', 'mi-regla.mjs'), 'export default function(){ return []; }');

  // reviewed_rules = TODAS las built-in actuales (generadas dinámicamente), pero NO la custom.
  const { RULES, PROJECT_RULES } = await import(join(PLUGIN_ROOT, 'rules', 'index.mjs'));
  const reviewed = [...Object.keys(RULES), ...Object.keys(PROJECT_RULES)];
  writeFileSync(join(dir, '.praxis-guard', 'meta.json'), JSON.stringify({ reviewed_rules: reviewed }));

  const r = spawnSync('node', [HOOK], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: dir, TMPDIR: dir } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /mi-regla|sin revisar/i, 'avisa de la regla custom no revisada');
  console.log('session-offer-custom.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
