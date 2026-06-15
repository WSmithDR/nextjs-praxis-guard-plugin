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
console.log('fingerprint.test ok');
