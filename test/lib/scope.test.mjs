import { isInScope } from '../../lib/scope.mjs';
import { loadConfig } from '../../lib/config.mjs';
import assert from 'node:assert/strict';

const cfg = loadConfig({ projectConfigPath: '/no/such.json' });
assert.equal(isInScope('app/page.tsx', cfg), true);
assert.equal(isInScope('lib/util.ts', cfg), true);
assert.equal(isInScope('README.md', cfg), false, 'non-code excluded');
assert.equal(isInScope('node_modules/x/index.js', cfg), false, 'excluded dir');
assert.equal(isInScope('/abs/project/.next/server/page.js', cfg), false, 'excluded dir abs');
console.log('scope.test ok');
