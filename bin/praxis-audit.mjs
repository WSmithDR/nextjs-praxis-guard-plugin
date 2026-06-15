// bin/praxis-audit.mjs
// Motor de auditoría de proyecto. Reusa runDetector (file rules) + PROJECT_RULES.
// Modos: --full (todo), --staged (git staged), --since <ref> (incremental),
// o decisión automática (versión/fingerprint -> full; si no -> incremental).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, defaultProjectConfigPath } from '../lib/config.mjs';
import { isInScope } from '../lib/scope.mjs';
import { formatFindings } from '../lib/findings.mjs';
import { enumerateFiles, buildProjectTree } from '../lib/walk.mjs';
import { runDetector } from '../hooks/detect.mjs';
import { PROJECT_RULES } from '../rules/index.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def) {
  const eq = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}

const dir = resolve(arg('dir', process.cwd()));
const config = loadConfig({ projectConfigPath: defaultProjectConfigPath(dir) });

function runFileRules(relPaths) {
  const findings = [];
  for (const rel of relPaths) {
    const abs = join(dir, rel);
    let res;
    try { res = runDetector(abs, { config }); } catch { continue; }
    for (const f of res.findings) findings.push({ ...f, file: rel });
  }
  return findings;
}

function runProjectRules() {
  const tree = buildProjectTree(enumerateFiles(dir, config));
  const findings = [];
  for (const [id, fn] of Object.entries(PROJECT_RULES)) {
    const rc = (config.rules && config.rules[id]) || {};
    if (rc.enabled === false) continue;
    try { for (const f of fn(tree, config)) findings.push({ ...f, file: f.file || '(proyecto)' }); }
    catch { /* una regla rota nunca rompe la auditoría */ }
  }
  return findings;
}

function report(findings) {
  if (!findings.length) { console.log('praxis-audit: sin findings ✅'); return; }
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, fs] of byFile) console.log(formatFindings(fs, file) + '\n');
  console.log(`praxis-audit: ${findings.length} finding(s) en ${byFile.size} archivo(s).`);
}

// --- primer corte: solo full ---
const files = enumerateFiles(dir, config);
const findings = [...runFileRules(files), ...runProjectRules()];
report(findings);
process.exit(0);
