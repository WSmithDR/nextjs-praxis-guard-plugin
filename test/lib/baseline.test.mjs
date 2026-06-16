import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findingFingerprint, readBaseline, writeBaseline, applyBaseline } from '../../lib/baseline.mjs';
import assert from 'node:assert/strict';

// huella estable: misma rule/file/message, línea distinta -> misma huella
const a = findingFingerprint({ rule: 'secrets', file: 'src/a.ts', line: 3, message: 'X' });
const b = findingFingerprint({ rule: 'secrets', file: 'src/a.ts', line: 99, message: 'X' });
assert.equal(a, b, 'la línea no afecta la huella');
assert.ok(a.startsWith('sha256:'));
// cambiar el message -> huella distinta
assert.notEqual(a, findingFingerprint({ rule: 'secrets', file: 'src/a.ts', line: 3, message: 'Y' }));

// read/write roundtrip
const dir = mkdtempSync(join(tmpdir(), 'praxis-baseline-'));
try {
  assert.equal(readBaseline(dir), null, 'sin archivo -> null');
  writeBaseline(dir, [a, 'sha256:zzz'], { created_at: '2026-06-15', plugin_version: '0.2.0' });
  const bl = readBaseline(dir);
  assert.deepEqual(bl.fingerprints, [a, 'sha256:zzz']);
  assert.equal(bl.created_at, '2026-06-15');
  const onDisk = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'baseline.json'), 'utf8'));
  assert.ok(Array.isArray(onDisk.fingerprints));

  // applyBaseline: separa shown/suppressed + cuenta resolved
  const findings = [
    { rule: 'secrets', file: 'src/a.ts', line: 5, message: 'X' },   // huella a -> baselined
    { rule: 'secrets', file: 'src/b.ts', line: 1, message: 'NEW' }, // nuevo
  ];
  const res = applyBaseline(findings, bl);
  assert.equal(res.suppressed.length, 1);
  assert.equal(res.shown.length, 1);
  assert.equal(res.shown[0].message, 'NEW');
  assert.equal(res.resolvedCount, 1, 'sha256:zzz no apareció -> 1 resuelto');

  // baseline null -> todo shown
  const res2 = applyBaseline(findings, null);
  assert.equal(res2.shown.length, 2);
  assert.equal(res2.resolvedCount, 0);
  console.log('baseline.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
