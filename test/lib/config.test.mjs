import { loadConfig, defaultProjectConfigPath } from '../../lib/config.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const def = loadConfig({ projectConfigPath: '/no/such/file.json' });
assert.equal(def.rules['file-responsibility'].maxLines, 400);
assert.equal(def.rules.secrets.enabled, true);
assert.deepEqual(def.rules['forbidden-imports'].list, []);

const merged = loadConfig({
  projectConfigPath: '/no/such/file.json',
  override: { rules: { 'file-responsibility': { maxLines: 250 } } },
});
assert.equal(merged.rules['file-responsibility'].maxLines, 250);
assert.equal(merged.rules['file-responsibility'].mixedSignalsLines, 200, 'untouched key kept');
assert.equal(merged.rules.secrets.enabled, true, 'other rules kept');

// --- CLI-agnostic project config path resolution ---

// 1) None of the files exist -> canonical .praxis-guard default.
{
  const dir = mkdtempSync(join(tmpdir(), 'praxis-cfg-none-'));
  try {
    assert.equal(
      defaultProjectConfigPath(dir),
      join(dir, '.praxis-guard', 'config.json'),
      'no files present -> canonical .praxis-guard default',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 2) Only .claude/... present -> backward-compat path resolves.
{
  const dir = mkdtempSync(join(tmpdir(), 'praxis-cfg-claude-'));
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    const claudePath = join(dir, '.claude', 'nextjs-praxis-guard.json');
    writeFileSync(claudePath, '{}');
    assert.equal(
      defaultProjectConfigPath(dir),
      claudePath,
      'only .claude present -> resolves to .claude (backward-compat)',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 3) Both root and .claude present -> priority 1 (repo-root) wins.
{
  const dir = mkdtempSync(join(tmpdir(), 'praxis-cfg-both-'));
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    const rootPath = join(dir, 'nextjs-praxis-guard.json');
    writeFileSync(rootPath, '{}');
    writeFileSync(join(dir, '.claude', 'nextjs-praxis-guard.json'), '{}');
    assert.equal(
      defaultProjectConfigPath(dir),
      rootPath,
      'both present -> repo-root wins (priority 1)',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 4) loadConfig applies an override placed at the agnostic root path.
{
  const dir = mkdtempSync(join(tmpdir(), 'praxis-cfg-load-'));
  try {
    writeFileSync(
      join(dir, 'nextjs-praxis-guard.json'),
      JSON.stringify({ rules: { 'file-responsibility': { maxLines: 123 } } }),
    );
    const loaded = loadConfig({ projectConfigPath: defaultProjectConfigPath(dir) });
    assert.equal(
      loaded.rules['file-responsibility'].maxLines,
      123,
      'agnostic root override is applied by loadConfig',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// .praxis-guard/config.json takes highest priority
import { mkdtempSync as _mkdtemp2, mkdirSync as _mkdir2, writeFileSync as _write2, rmSync as _rm2 } from 'node:fs';
import { tmpdir as _tmp2 } from 'node:os';
import { join as _join2 } from 'node:path';

const _d = _mkdtemp2(_join2(_tmp2(), 'praxis-prio-'));
_mkdir2(_join2(_d, '.praxis-guard'));
_write2(_join2(_d, '.praxis-guard', 'config.json'), '{}');
_write2(_join2(_d, 'nextjs-praxis-guard.json'), '{}');
assert.equal(defaultProjectConfigPath(_d), _join2(_d, '.praxis-guard', 'config.json'), '.praxis-guard wins over root file');

const _empty = _mkdtemp2(_join2(_tmp2(), 'praxis-empty-'));
assert.equal(defaultProjectConfigPath(_empty), _join2(_empty, '.praxis-guard', 'config.json'), 'default is the canonical .praxis-guard path');

[_d, _empty].forEach((x) => _rm2(x, { recursive: true, force: true }));

console.log('config.test ok');
