import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack } from '../../lib/detect-stack.mjs';
import assert from 'node:assert/strict';

function tmp() { return mkdtempSync(join(tmpdir(), 'praxis-detect-')); }

// sin nada
{
  const d = tmp();
  const r = detectStack(d);
  assert.equal(r.typescript, false);
  assert.equal(r.tailwind, false);
  assert.equal(r.tsconfigOptions, null);
  rmSync(d, { recursive: true, force: true });
}
// tsconfig limpio + tailwind
{
  const d = tmp();
  writeFileSync(join(d, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
  writeFileSync(join(d, 'tailwind.config.js'), 'module.exports = {};');
  const r = detectStack(d);
  assert.equal(r.typescript, true);
  assert.equal(r.tailwind, true);
  assert.equal(r.tsconfigOptions.strict, true);
  assert.equal(r.tsconfigFixable, true);
  rmSync(d, { recursive: true, force: true });
}
// tsconfig JSONC (comentarios) -> parsea pero NO fixable
{
  const d = tmp();
  writeFileSync(join(d, 'tsconfig.json'), '{\n  // comentario\n  "compilerOptions": { "strict": false }\n}');
  const r = detectStack(d);
  assert.equal(r.typescript, true);
  assert.equal(r.tsconfigOptions.strict, false);
  assert.equal(r.tsconfigFixable, false);
  rmSync(d, { recursive: true, force: true });
}
// tsconfig con extends -> no fixable
{
  const d = tmp();
  writeFileSync(join(d, 'tsconfig.json'), JSON.stringify({ extends: './base.json', compilerOptions: {} }));
  const r = detectStack(d);
  assert.equal(r.tsconfigFixable, false);
  rmSync(d, { recursive: true, force: true });
}
console.log('detect-stack.test ok');
