import { RULES, PROJECT_RULES } from '../../rules/index.mjs';
import assert from 'node:assert/strict';

// Las 5 file rules del MVP siguen presentes.
for (const id of ['secrets','hardcoded-data','forbidden-imports','file-responsibility','untranslated-text']) {
  assert.equal(typeof RULES[id], 'function', `falta file rule ${id}`);
}
// PROJECT_RULES existe y es objeto (puede estar vacío todavía).
assert.equal(typeof PROJECT_RULES, 'object');
assert.ok(PROJECT_RULES && !Array.isArray(PROJECT_RULES));
console.log('index.test ok');
