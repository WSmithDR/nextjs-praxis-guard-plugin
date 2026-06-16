import assert from 'node:assert/strict';
import { rulesFingerprint } from '../../lib/fingerprint.mjs';

// El fingerprint debe cubrir las reglas AST: cambiar su config cambia el hash.
// (si AST_RULES no estuviera en los ids, estos dos hashes serían iguales.)
const base = rulesFingerprint({ rules: {} });
const tweaked = rulesFingerprint({ rules: { 'type-duplicate-shape': { enabled: false } } });
assert.notEqual(base, tweaked, 'cambiar la config de una regla AST debe cambiar el fingerprint');

console.log('fingerprint-ast.test ok');
