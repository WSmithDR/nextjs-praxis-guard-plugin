import { isInScope } from '../../lib/scope.mjs';
import { loadConfig } from '../../lib/config.mjs';
import assert from 'node:assert/strict';

const cfg = loadConfig({ projectConfigPath: '/no/such.json' });
assert.equal(isInScope('app/page.tsx', cfg), true);
assert.equal(isInScope('lib/util.ts', cfg), true);
assert.equal(isInScope('README.md', cfg), false, 'non-code excluded');
assert.equal(isInScope('node_modules/x/index.js', cfg), false, 'excluded dir');
assert.equal(isInScope('/abs/project/.next/server/page.js', cfg), false, 'excluded dir abs');

// regression: exclude must match whole path segments, not substrings
assert.equal(isInScope('app/my-build/foo.ts', cfg), true, 'my-build is not build/');
assert.equal(isInScope('app/prebuild/foo.ts', cfg), true, 'prebuild is not build/');
assert.equal(isInScope('src/code-coverage/y.ts', cfg), true, 'code-coverage is not coverage/');
assert.equal(isInScope('pkg/build/foo.ts', cfg), false, 'real build/ segment excluded');
console.log('scope.test ok');
