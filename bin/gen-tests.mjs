#!/usr/bin/env node
// CLI del generador: imprime el PLAN (JSON) a stdout. El typescript se resuelve como peer del
// proyecto (para el parser); si falta, el plan omite la firma del componente.
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildTestPlan } from '../lib/gen-tests-plan.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}

const target = process.argv[2] && !process.argv[2].startsWith('--') ? resolve(process.argv[2]) : null;
if (!target) { console.error('uso: node bin/gen-tests.mjs <archivo> [--dir <proyecto>]'); process.exit(1); }
const dir = resolve(arg('dir', process.cwd()));

let ts = null;
try {
  const req = createRequire(join(dir, 'noop.js'));
  const mod = await import(pathToFileURL(req.resolve('typescript')).href);
  ts = mod.default || mod;
  if (typeof ts.createSourceFile !== 'function') ts = null;
} catch { ts = null; }
if (!ts) console.error('gen-tests: typescript no resuelto — el plan no incluye la firma del componente.');

const plan = buildTestPlan(ts, dir, target);
process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
