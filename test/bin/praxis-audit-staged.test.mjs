import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');
function git(dir, args) { return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); }

function setup(commitCfg) {
  const dir = mkdtempSync(join(tmpdir(), 'praxis-staged-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@t.t']); git(dir, ['config', 'user.name', 't']);
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { secrets: { enabled: true } }, commit: commitCfg }));
  writeFileSync(join(dir, 'src', 'leak.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef";');
  git(dir, ['add', 'src/leak.ts']);   // staged
  return dir;
}

// block:false -> avisa pero exit 0
{
  const dir = setup({ check: true, block: false, minSeverity: 'warn' });
  const r = spawnSync('node', [AUDIT, '--staged', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'block:false no bloquea');
  assert.match(r.stdout, /leak\.ts/);
  rmSync(dir, { recursive: true, force: true });
}
// block:true + warn -> exit 1
{
  const dir = setup({ check: true, block: true, minSeverity: 'warn' });
  const r = spawnSync('node', [AUDIT, '--staged', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1, 'block:true con finding >= warn bloquea');
  rmSync(dir, { recursive: true, force: true });
}
console.log('praxis-audit-staged.test ok');
