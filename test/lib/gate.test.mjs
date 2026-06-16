import assert from 'node:assert/strict';
import { gateExitCode } from '../../lib/gate.mjs';

const info = { severity: 'info' }, warn = { severity: 'warn' }, error = { severity: 'error' };

assert.equal(gateExitCode([info], {}), 0, 'info no frena con default warn');
assert.equal(gateExitCode([warn], {}), 1, 'warn frena');
assert.equal(gateExitCode([error], {}), 1, 'error frena');
assert.equal(gateExitCode([], {}), 0, 'sin findings no frena');

assert.equal(gateExitCode([info], { commit: { minSeverity: 'info' } }), 1);
assert.equal(gateExitCode([warn], { commit: { minSeverity: 'error' } }), 0);
assert.equal(gateExitCode([error], { commit: { minSeverity: 'error' } }), 1);

console.log('gate.test ok');
