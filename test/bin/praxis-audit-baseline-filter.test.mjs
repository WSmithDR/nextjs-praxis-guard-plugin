import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');
function run(dir, ...args) { return spawnSync('node', [AUDIT, ...args, '--dir', dir], { encoding: 'utf8' }); }

const dir = mkdtempSync(join(tmpdir(), 'praxis-blfilter-'));
try {
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { secrets: { enabled: true } } }));
  writeFileSync(join(dir, 'src', 'old.ts'), 'const k = "sk_live_0123456789abcdef";');

  // aceptar la deuda actual
  assert.equal(run(dir, '--update-baseline').status, 0);

  // agregar un finding NUEVO
  writeFileSync(join(dir, 'src', 'new.ts'), 'const z = "sk_live_ffffffffffffffff";');

  // default: oculta el viejo, muestra solo el nuevo
  const r = run(dir, '--full');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /new\.ts/, 'muestra el finding nuevo');
  assert.doesNotMatch(r.stdout, /old\.ts/, 'oculta el viejo (baselined)');
  assert.match(r.stdout, /ocultos por baseline/, 'reporta el contador');

  // --no-baseline: muestra todo
  const r2 = run(dir, '--full', '--no-baseline');
  assert.match(r2.stdout, /old\.ts/, '--no-baseline muestra el viejo');
  assert.match(r2.stdout, /new\.ts/);
  console.log('praxis-audit-baseline-filter.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
