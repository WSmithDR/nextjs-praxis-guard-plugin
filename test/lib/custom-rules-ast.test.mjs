import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCustomRules } from '../../lib/custom-rules.mjs';

const dir = mkdtempSync(join(tmpdir(), 'crast-'));
const rulesDir = join(dir, '.praxis-guard', 'rules');
mkdirSync(rulesDir, { recursive: true });
writeFileSync(join(rulesDir, 'my-ast.mjs'),
  "export const meta = { kind: 'ast' };\nexport default function () { return []; }\n");

const out = await loadCustomRules(dir);
assert.equal(typeof out.astRules['my-ast'], 'function', 'my-ast en astRules');
assert.equal(out.fileRules['my-ast'], undefined, 'no debe estar en fileRules');

writeFileSync(join(rulesDir, 'type-duplicate-shape.mjs'), 'export default function(){return [];}');
const out2 = await loadCustomRules(dir);
assert.ok(out2.errors.some((e) => e.id === 'type-duplicate-shape'), 'esperaba error de colisión');

console.log('custom-rules-ast.test ok');
