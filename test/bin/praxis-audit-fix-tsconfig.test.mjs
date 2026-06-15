import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');

// JSON limpio -> escribe los flags faltantes
{
  const dir = mkdtempSync(join(tmpdir(), 'praxis-fixts-'));
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { 'tsconfig-strictness': { baseline: ['strict', 'noImplicitAny'] } } }));
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: false } }, null, 2));
  const r = spawnSync('node', [AUDIT, '--fix-tsconfig', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const ts = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'));
  assert.equal(ts.compilerOptions.strict, true);
  assert.equal(ts.compilerOptions.noImplicitAny, true);
  rmSync(dir, { recursive: true, force: true });
}
// con extends -> NO escribe, avisa
{
  const dir = mkdtempSync(join(tmpdir(), 'praxis-fixts2-'));
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { 'tsconfig-strictness': { baseline: ['strict'] } } }));
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ extends: './base.json', compilerOptions: { strict: false } }, null, 2));
  const r = spawnSync('node', [AUDIT, '--fix-tsconfig', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const ts = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'));
  assert.equal(ts.compilerOptions.strict, false, 'no se modificó (extends)');
  assert.match(r.stdout, /a mano|no fixable|extends/i);
  rmSync(dir, { recursive: true, force: true });
}
console.log('praxis-audit-fix-tsconfig.test ok');
