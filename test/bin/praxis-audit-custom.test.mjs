import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-audit-custom-'));
try {
  mkdirSync(join(dir, '.praxis-guard', 'rules'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), '{}');
  // file rule custom
  writeFileSync(join(dir, '.praxis-guard', 'rules', 'no-foo.mjs'),
    'export default function(c, p){ return c.includes("FOO") ? [{rule:"no-foo",line:1,severity:"warn",message:"foo prohibido"}] : []; }');
  // regla rota
  writeFileSync(join(dir, '.praxis-guard', 'rules', 'broken.mjs'), 'export default function( { nope');
  writeFileSync(join(dir, 'src', 'a.ts'), 'const FOO = 1;');

  const r = spawnSync('node', [AUDIT, '--full', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no-foo|foo prohibido/, 'corre la regla custom');
  assert.match(r.stdout, /broken.*no cargó|no cargó.*broken/, 'reporta el error de carga');
  console.log('praxis-audit-custom.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
