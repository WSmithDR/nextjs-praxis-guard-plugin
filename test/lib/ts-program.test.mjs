import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTsContext } from '../../lib/ts-program.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scope = { include: ['.ts', '.tsx'], exclude: ['node_modules'] };

const ctx = await buildTsContext(join(here, '..', 'fixtures', 'ast', 'program'), scope);
assert.ok(ctx, 'esperaba un context');
assert.ok(ctx.checker, 'esperaba checker');
assert.ok(ctx.sourceFiles.some((sf) => sf.fileName.endsWith('/a.ts')), 'esperaba a.ts en sourceFiles');
assert.equal(ctx.sourceFiles.some((sf) => sf.isDeclarationFile), false, 'no debería incluir .d.ts');

const none = await buildTsContext(join(here, '..', 'fixtures'), scope);
assert.equal(none, null, 'sin tsconfig -> null');

console.log('ts-program.test ok');
