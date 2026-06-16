import { runDetector } from '../hooks/detect.mjs';
import assert from 'node:assert/strict';

// out-of-scope file => no findings, no throw
assert.deepEqual(runDetector('README.md', { content: 'sk_live_aaaaaaaaaaaaaaaaaa' }).findings, []);

// in-scope file with a secret => finding
const r = runDetector('lib/keys.ts', { content: 'const k = "sk_live_EXAMPLEkey123456";' });
assert.ok(r.findings.length >= 1, 'detects secret');
assert.ok(r.text.includes('praxis-guard'), 'formatted text present');

// weird/empty input must not throw
assert.doesNotThrow(() => runDetector('x.tsx', { content: '' }));
console.log('detect.test ok');
