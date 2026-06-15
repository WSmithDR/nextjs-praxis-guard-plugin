import { validateConfig } from '../../lib/validate-config.mjs';
import assert from 'node:assert/strict';

assert.equal(validateConfig({}).ok, true);
assert.equal(validateConfig({ rules: { secrets: { enabled: false } } }).ok, true);
assert.equal(validateConfig({ rules: { 'file-responsibility': { maxLines: 300, mixedSignalsLines: 150 } } }).ok, true);
assert.equal(validateConfig({ rules: { 'forbidden-imports': { list: [{ module: 'lodash', message: 'x' }] } } }).ok, true);
assert.equal(validateConfig({ include: ['.ts'], exclude: ['dist/'] }).ok, true);

let r = validateConfig({ rules: { 'no-such-rule': {} } });
assert.equal(r.ok, false);
assert.ok(r.errors.some((e) => /desconocida/.test(e)), 'flags unknown rule');

r = validateConfig({ rules: { 'file-responsibility': { maxLines: '300' } } });
assert.equal(r.ok, false);
assert.ok(r.errors.some((e) => /maxLines/.test(e)));

assert.equal(validateConfig({ rules: { secrets: { enabled: 'yes' } } }).ok, false);

r = validateConfig({ rules: { 'forbidden-imports': { list: [{ message: 'x' }] } } });
assert.equal(r.ok, false);
assert.ok(r.errors.some((e) => /module/.test(e)));

assert.equal(validateConfig({ rules: { 'untranslated-text': { ignore: 'Enviar' } } }).ok, false);

assert.equal(validateConfig(null).ok, false);
assert.equal(validateConfig([]).ok, false);

// --- arquitectura + reglas nuevas + commit ---
{
  const ok = validateConfig({
    architecture: { strategy: 'by-feature', root: 'src', featuresDir: 'src/features', sharedDirs: ['src/shared'] },
    rules: {
      'folder-placement': { enabled: true, placement: [{ kind: 'hook', match: '^use[A-Z]', allowed: ['**/hooks/**'] }] },
      'layer-boundaries': { enabled: true, layers: [{ name: 'domain', path: 'src/domain', mayImport: [] }] },
      'feature-deps': { enabled: false, publicEntry: ['index.ts'] },
      'server-client-boundaries': { enabled: false, serverOnly: ['server-only'] },
      'architecture-coherence': { enabled: false },
    },
    commit: { check: true, block: false, minSeverity: 'warn' },
  });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
}
{
  const bad = validateConfig({ architecture: { strategy: 'nope' } });
  assert.equal(bad.ok, false);
}
{
  const bad = validateConfig({ rules: { 'layer-boundaries': { layers: 'x' } } });
  assert.equal(bad.ok, false);
}
{
  const bad = validateConfig({ commit: { minSeverity: 'fatal' } });
  assert.equal(bad.ok, false);
}
console.log('validate-config arch cases ok');
console.log('validate-config.test ok');
