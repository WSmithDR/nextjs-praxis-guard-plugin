import { rulesFingerprint } from '../../lib/fingerprint.mjs';
import assert from 'node:assert/strict';

const base = { architecture: { strategy: 'by-feature' }, rules: { secrets: { enabled: true } } };
const a = rulesFingerprint(base);
const b = rulesFingerprint(JSON.parse(JSON.stringify(base)));
assert.equal(a, b, 'misma config -> mismo hash');
assert.ok(a.startsWith('sha256:'));

const toggled = rulesFingerprint({ ...base, rules: { secrets: { enabled: false } } });
assert.notEqual(a, toggled, 'toggle de regla cambia el hash');

const archChanged = rulesFingerprint({ ...base, architecture: { strategy: 'by-layer' } });
assert.notEqual(a, archChanged, 'cambio de architecture cambia el hash');
// --- custom rule sources ---
{
  const base = { rules: {} };
  const a = rulesFingerprint(base, {});
  const withCustom = rulesFingerprint(base, { 'no-foo': 'export default () => []' });
  assert.notEqual(a, withCustom, 'una custom cambia el fingerprint');
  const sameCustom = rulesFingerprint(base, { 'no-foo': 'export default () => []' });
  assert.equal(withCustom, sameCustom, 'mismo source -> mismo fingerprint');
  const edited = rulesFingerprint(base, { 'no-foo': 'export default () => [1]' });
  assert.notEqual(withCustom, edited, 'editar la custom cambia el fingerprint');
}
console.log('fingerprint custom sources ok');
console.log('fingerprint.test ok');
