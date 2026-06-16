import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack } from '../../lib/detect-stack.mjs';

const dir = mkdtempSync(join(tmpdir(), 'dstw-'));
writeFileSync(join(dir, 'tailwind.config.js'), 'module.exports = {};');
const d = detectStack(dir);
assert.equal(d.tailwind, true);
assert.ok(d.tailwindConfigPath && d.tailwindConfigPath.endsWith('tailwind.config.js'), `path=${d.tailwindConfigPath}`);

const dir2 = mkdtempSync(join(tmpdir(), 'dstw0-'));
assert.equal(detectStack(dir2).tailwindConfigPath, null);
console.log('detect-stack-tailwind.test ok');
