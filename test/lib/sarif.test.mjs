import assert from 'node:assert/strict';
import { toSarif } from '../../lib/sarif.mjs';

const findings = [
  { rule: 'stringly-typed', file: 'src/b.ts', line: 3, severity: 'info', message: 'usá un union' },
  { rule: 'secrets', file: 'src/a.ts', line: 10, severity: 'error', message: 'key hardcodeada' },
  { rule: 'tsconfig-strictness', file: 'tsconfig.json', line: null, severity: 'warn', message: 'falta strict' },
];

const sarif = toSarif(findings, { toolName: 'nextjs-praxis-guard', toolVersion: '0.1.0' });

assert.equal(sarif.version, '2.1.0');
assert.ok(sarif.$schema);
assert.equal(sarif.runs.length, 1);
const run = sarif.runs[0];
assert.equal(run.tool.driver.name, 'nextjs-praxis-guard');
assert.equal(run.tool.driver.version, '0.1.0');

assert.equal(run.tool.driver.rules.length, 3);
assert.ok(run.tool.driver.rules.some((r) => r.id === 'secrets'));

assert.equal(run.results.length, 3);
const bySev = Object.fromEntries(run.results.map((r) => [r.ruleId, r.level]));
assert.equal(bySev['stringly-typed'], 'note');
assert.equal(bySev['tsconfig-strictness'], 'warning');
assert.equal(bySev['secrets'], 'error');

const sec = run.results.find((r) => r.ruleId === 'secrets');
assert.equal(sec.locations[0].physicalLocation.artifactLocation.uri, 'src/a.ts');
assert.equal(sec.locations[0].physicalLocation.region.startLine, 10);
assert.ok(sec.partialFingerprints.praxisFingerprint.startsWith('sha256:'));
assert.equal(sec.message.text, 'key hardcodeada');

const tsc = run.results.find((r) => r.ruleId === 'tsconfig-strictness');
assert.equal(tsc.locations[0].physicalLocation.region, undefined);

const shuffled = [findings[2], findings[0], findings[1]];
assert.equal(JSON.stringify(toSarif(findings, { toolName: 'x', toolVersion: '1' })),
             JSON.stringify(toSarif(shuffled, { toolName: 'x', toolVersion: '1' })));

// orden total: dos findings idénticos salvo severity -> reordenar la entrada no cambia la salida.
const tie = [
  { rule: 'r', file: 'f.ts', line: 1, severity: 'error', message: 'm' },
  { rule: 'r', file: 'f.ts', line: 1, severity: 'info', message: 'm' },
];
assert.equal(JSON.stringify(toSarif(tie, { toolName: 'x', toolVersion: '1' })),
             JSON.stringify(toSarif([tie[1], tie[0]], { toolName: 'x', toolVersion: '1' })));

console.log('sarif.test ok');
