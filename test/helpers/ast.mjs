// Helper para tests de reglas AST: arma un astContext real desde un fixture.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTsContext } from '../../lib/ts-program.mjs';

const FIXT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'ast');

// Devuelve el astContext para test/fixtures/ast/<name>/.
export async function buildContextFor(name) {
  const scope = { include: ['.ts', '.tsx'], exclude: ['node_modules'] };
  const ctx = await buildTsContext(join(FIXT, name), scope);
  if (!ctx) throw new Error(`no se pudo armar el context para fixture "${name}" (¿typescript instalado?)`);
  return ctx;
}
