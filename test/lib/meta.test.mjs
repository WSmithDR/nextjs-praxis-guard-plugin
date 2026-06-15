import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMeta, writeMeta } from '../../lib/meta.mjs';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'praxis-meta-'));
try {
  assert.deepEqual(readMeta(dir), {}, 'meta vacía al inicio');
  writeMeta(dir, { plugin_version: '0.2.0', reviewed_rules: ['secrets'] });
  writeMeta(dir, { last_audited_commit: 'abc' });           // merge, no pisa
  const m = readMeta(dir);
  assert.equal(m.plugin_version, '0.2.0');
  assert.deepEqual(m.reviewed_rules, ['secrets']);
  assert.equal(m.last_audited_commit, 'abc');
  const onDisk = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'meta.json'), 'utf8'));
  assert.equal(onDisk.last_audited_commit, 'abc');
  console.log('meta.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
