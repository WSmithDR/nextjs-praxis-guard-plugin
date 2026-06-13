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

// 1) None of the 3 files exist -> agnostic default (repo-root).
{
  const dir = mkdtempSync(join(tmpdir(), 'praxis-cfg-none-'));
  try {
    assert.equal(
      defaultProjectConfigPath(dir),
      join(dir, 'nextjs-praxis-guard.json'),
      'no files present -> CLI-agnostic default',
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

console.log('config.test ok');
