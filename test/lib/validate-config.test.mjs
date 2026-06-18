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
// --- reglas TS + Tailwind ---
{
  const ok = validateConfig({ rules: {
    'repeated-object-shape': { enabled: true, minProps: 2, minRepeats: 2 },
    'stringly-typed': { enabled: true, minLiterals: 2 },
    'duplicate-literal-union': { enabled: true, minMembers: 2, minRepeats: 2 },
    'prefer-as-const': { enabled: false },
    'tsconfig-strictness': { enabled: true, baseline: ['strict', 'noImplicitAny'] },
    'tailwind-arbitrary-values': { enabled: true, allow: ['grid-cols-'] },
    'tailwind-classname-bloat': { enabled: true, maxClasses: 12 },
    'tailwind-conditional-concat': { enabled: true },
    'tailwind-duplicate-utilities': { enabled: true },
  }});
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
}
assert.equal(validateConfig({ rules: { 'tsconfig-strictness': { baseline: 'strict' } } }).ok, false);
assert.equal(validateConfig({ rules: { 'tailwind-classname-bloat': { maxClasses: '12' } } }).ok, false);
assert.equal(validateConfig({ rules: { 'tailwind-arbitrary-values': { allow: 'x' } } }).ok, false);
console.log('validate-config ts/tailwind cases ok');
// --- reglas AST (Fase 2) + runOn ---
{
  const ok = validateConfig({ rules: {
    'type-duplicate-shape': { enabled: true, minProps: 2, runOn: 'full' },
    'inline-shape-extract': { enabled: true, minProps: 2 },
    'schema-type-redeclare': { enabled: true, minProps: 2, runOn: 'deep' },
    'magic-literal-repeated': { enabled: true, minFiles: 3, minLen: 4 },
  }});
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
}
assert.equal(validateConfig({ rules: { 'type-duplicate-shape': { runOn: 'fulll' } } }).ok, false);
assert.equal(validateConfig({ rules: { 'magic-literal-repeated': { minFiles: '3' } } }).ok, false);
console.log('validate-config ast cases ok');
// --- extraKnownRules (reglas custom) ---
assert.equal(validateConfig({ rules: { 'mi-regla': { enabled: false } } }).ok, false);
assert.equal(validateConfig({ rules: { 'mi-regla': { enabled: false } } }, ['mi-regla']).ok, true);
console.log('validate-config extraKnownRules ok');
// --- respectGitignore ---
assert.equal(validateConfig({ respectGitignore: true }).ok, true);
const bad = validateConfig({ respectGitignore: 'yes' });
assert.equal(bad.ok, false);
assert.ok(bad.errors.some((e) => e.includes('respectGitignore')), `errors=${bad.errors}`);
console.log('validate-config respectGitignore ok');
console.log('validate-config.test ok');
