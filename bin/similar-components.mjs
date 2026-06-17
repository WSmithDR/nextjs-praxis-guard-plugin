#!/usr/bin/env node
// CLI: detecta grupos de componentes parecidos en el proyecto e imprime el reporte (JSON) a stdout.
import { resolve, join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadConfig, defaultProjectConfigPath } from '../lib/config.mjs';
import { enumerateFiles } from '../lib/walk.mjs';
import { findSimilarGroups } from '../lib/similar-components.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}

const dir = resolve(arg('dir', process.cwd()));
const threshold = Number(arg('threshold', '0.85'));
const minElements = Number(arg('min-elements', '3'));

let ts = null;
try {
  const req = createRequire(join(dir, 'noop.js'));
  const mod = await import(pathToFileURL(req.resolve('typescript')).href);
  ts = mod.default || mod;
  if (typeof ts.createSourceFile !== 'function') ts = null;
} catch { ts = null; }
if (!ts) {
  console.error('similar-components: typescript no resuelto en el proyecto.');
  process.stdout.write(JSON.stringify({ groups: [] }, null, 2) + '\n');
  process.exit(0);
}

const config = loadConfig({ projectConfigPath: defaultProjectConfigPath(dir) });
const files = enumerateFiles(dir, config).filter((f) => /\.(tsx|jsx)$/.test(f)).map((f) => join(dir, f));
const groups = findSimilarGroups(ts, files, { threshold, minElements });
for (const g of groups) for (const c of g.components) c.file = relative(dir, c.file);
process.stdout.write(JSON.stringify({ groups }, null, 2) + '\n');
