import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');
function git(dir, args) { return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); }

const dir = mkdtempSync(join(tmpdir(), 'praxis-stbl-'));
try {
  git(dir, ['init', '-q']); git(dir, ['config', 'user.email', 't@t.t']); git(dir, ['config', 'user.name', 't']);
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { secrets: { enabled: true } }, commit: { check: true, block: true, minSeverity: 'warn' } }));
  writeFileSync(join(dir, 'src', 'old.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef";');
  git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'init']);

  // aceptar la deuda actual (incluye old.ts)
  assert.equal(spawnSync('node', [AUDIT, '--update-baseline', '--dir', dir], { encoding: 'utf8' }).status, 0);

  // staged solo old.ts (baselined) -> NO bloquea
  writeFileSync(join(dir, 'src', 'old.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef"; // edit');
  git(dir, ['add', 'src/old.ts']);
  let r = spawnSync('node', [AUDIT, '--staged', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'baselined staged no bloquea');

  // staged un finding NUEVO -> bloquea
  writeFileSync(join(dir, 'src', 'new.ts'), 'const z = "sk_live_ffffffffffffffffffffffffffffffff";');
  git(dir, ['add', 'src/new.ts']);
  r = spawnSync('node', [AUDIT, '--staged', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1, 'finding nuevo staged bloquea');
  console.log('praxis-audit-staged-baseline.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
