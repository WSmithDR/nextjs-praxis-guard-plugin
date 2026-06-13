// test/run.mjs — runs every *.test.mjs under test/, fails loudly on first error.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.test.mjs')) acc.push(p);
  }
  return acc;
}

const root = dirname(fileURLToPath(import.meta.url));
const files = walk(root);
let failed = 0;
for (const f of files) {
  try { await import(pathToFileURL(f).href); }
  catch (e) { failed++; console.error(`FAIL ${f}\n`, e.message); }
}
console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exit(failed ? 1 : 0);
