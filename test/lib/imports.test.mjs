import { extractImports } from '../../lib/imports.mjs';
import assert from 'node:assert/strict';

const src = [
  "import a from '@/domain/user';",
  "import { b } from \"../infra/db\";",
  "export { c } from './local';",
  "const d = require('node:fs');",
  "const noimport = 1;",
].join('\n');

const out = extractImports(src);
const sources = out.map((x) => x.source);
assert.deepEqual(sources, ['@/domain/user', '../infra/db', './local', 'node:fs']);
assert.equal(out[0].line, 1);
assert.equal(out[3].line, 4);
console.log('imports.test ok');
