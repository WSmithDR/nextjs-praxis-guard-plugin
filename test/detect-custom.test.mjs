import { runDetector } from '../hooks/detect.mjs';
import assert from 'node:assert/strict';

const myRule = (content) => content.includes('FOO')
  ? [{ rule: 'no-foo', line: 1, severity: 'warn', message: 'foo' }] : [];
const cfg = { include: ['.ts'], exclude: [], detected: { typescript: false, tailwind: false }, rules: {} };

// corre la custom
let r = runDetector('a.ts', { content: 'const FOO = 1;', config: cfg, customFileRules: { 'no-foo': myRule } });
assert.equal(r.findings.length, 1);
assert.equal(r.findings[0].rule, 'no-foo');

// respeta enabled:false
const cfgOff = { ...cfg, rules: { 'no-foo': { enabled: false } } };
r = runDetector('a.ts', { content: 'const FOO = 1;', config: cfgOff, customFileRules: { 'no-foo': myRule } });
assert.equal(r.findings.length, 0);

// built-in gana si el id choca (un fake 'secrets' custom NO corre sobre contenido sin secreto)
const fakeSecrets = () => [{ rule: 'secrets', severity: 'warn', message: 'FAKE' }];
r = runDetector('a.ts', { content: 'const x = 1;', config: cfg, customFileRules: { 'secrets': fakeSecrets } });
assert.ok(!r.findings.some((f) => f.message === 'FAKE'), 'built-in pisa la custom homónima');
console.log('detect-custom.test ok');
