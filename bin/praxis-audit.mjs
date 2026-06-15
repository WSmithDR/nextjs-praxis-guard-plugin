// bin/praxis-audit.mjs
// Motor de auditoría de proyecto. Reusa runDetector (file rules) + PROJECT_RULES.
// Modos: --full (todo), --staged (git staged), --since <ref> (incremental),
// o decisión automática (versión/fingerprint -> full; si no -> incremental).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, defaultProjectConfigPath } from '../lib/config.mjs';
import { isInScope } from '../lib/scope.mjs';
import { formatFindings } from '../lib/findings.mjs';
import { enumerateFiles, buildProjectTree } from '../lib/walk.mjs';
import { runDetector } from '../hooks/detect.mjs';
import { PROJECT_RULES } from '../rules/index.mjs';
import { rulesFingerprint } from '../lib/fingerprint.mjs';
import { readMeta, writeMeta } from '../lib/meta.mjs';
import { detectStack } from '../lib/detect-stack.mjs';
import { applyFix, computeMissing } from '../lib/tsconfig-fix.mjs';

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
try { config.detected = detectStack(dir); } catch { config.detected = { typescript: false, tailwind: false, tsconfigOptions: null, tsconfigFixable: false }; }

if (process.argv.includes('--fix-tsconfig')) {
  const det = config.detected || {};
  const baseline = (config.rules && config.rules['tsconfig-strictness'] && config.rules['tsconfig-strictness'].baseline) || ['strict', 'noImplicitAny'];
  if (!det.typescript || !det.tsconfigPath) {
    console.log('praxis-audit: no hay tsconfig.json para arreglar.');
    process.exit(0);
  }
  const missing = computeMissing(det.tsconfigOptions, baseline);
  if (missing.length === 0) {
    console.log('praxis-audit: tsconfig ya cumple el baseline ✅');
    process.exit(0);
  }
  if (!det.tsconfigFixable) {
    console.log(`praxis-audit: tsconfig.json no es auto-fixable (tiene comentarios o "extends"). Agregá estos flags a mano en compilerOptions: ${missing.join(', ')}`);
    process.exit(0);
  }
  const res = applyFix(det.tsconfigPath, baseline);
  console.log(res.written
    ? `praxis-audit: tsconfig.json actualizado — agregados: ${res.missing.join(', ')}`
    : 'praxis-audit: nada que cambiar en tsconfig.json.');
  process.exit(0);
}

function pluginVersion() {
  try {
    const m = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    return m.version || '0.0.0';
  } catch { return '0.0.0'; }
}
// git con array de args (sin shell): refs/paths con metacaracteres no se interpolan.
function gitLines(d, args) {
  try { return execFileSync('git', args, { cwd: d, encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean); }
  catch { return null; }
}
function head(d) { const l = gitLines(d, ['rev-parse', 'HEAD']); return l && l[0]; }
function diffFiles(d, ref) {
  const committed = gitLines(d, ['diff', '--name-only', `${ref}..HEAD`]);
  if (committed == null) return null;             // sin git / ref inválido
  const unstaged = gitLines(d, ['diff', '--name-only']) || [];
  const staged = gitLines(d, ['diff', '--name-only', '--cached']) || [];
  const all = new Set([...committed, ...unstaged, ...staged].map((p) => p.replace(/\\/g, '/')));
  return [...all].filter((p) => isInScope(p, config));
}
function structuralChanged(d, ref) {
  const st = gitLines(d, ['diff', '--name-status', `${ref}..HEAD`]);
  if (st == null) return true;                    // ante la duda, corré project rules
  return st.some((line) => /^[ADR]/.test(line));
}
function stagedFiles(d) {
  const s = gitLines(d, ['diff', '--name-only', '--cached']) || [];
  return s.map((p) => p.replace(/\\/g, '/')).filter((p) => isInScope(p, config));
}

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

const meta = readMeta(dir);
const fp = rulesFingerprint(config);
const ver = pluginVersion();
const forceFull = process.argv.includes('--full');
const staged = process.argv.includes('--staged');
const sinceArg = arg('since', null);

let mode, targets = null;
if (staged) {
  mode = 'staged'; targets = stagedFiles(dir);
} else if (forceFull) {
  mode = 'full';
} else if (sinceArg) {
  mode = 'incremental'; targets = diffFiles(dir, sinceArg);
} else if (ver !== meta.plugin_version || fp !== meta.rules_fingerprint || !meta.last_audited_commit) {
  mode = 'full';
} else {
  mode = 'incremental'; targets = diffFiles(dir, meta.last_audited_commit);
}
if (mode === 'incremental' && targets == null) mode = 'full';   // degradación sin git

let findings;
let ranProject = false;
if (mode === 'full') {
  const files = enumerateFiles(dir, config);
  findings = [...runFileRules(files), ...runProjectRules()];
  ranProject = true;
} else if (mode === 'staged') {
  findings = runFileRules(targets || []);
} else {
  findings = runFileRules(targets);
  const ref = sinceArg || meta.last_audited_commit;
  if (structuralChanged(dir, ref)) { findings = [...findings, ...runProjectRules()]; ranProject = true; }
}

report(findings);
console.log(`praxis-audit: modo ${mode}${ranProject ? ' (con project rules)' : ''}.`);

// staged NO avanza el estado (el commit aún no ocurrió).
if (mode !== 'staged') {
  const h = head(dir);
  if (h) writeMeta(dir, { last_audited_commit: h, rules_fingerprint: fp, plugin_version: ver });
}

// Bloqueo de commit configurable.
let exitCode = 0;
if (mode === 'staged') {
  const commitCfg = config.commit || {};
  if (commitCfg.block) {
    const rank = { info: 1, warn: 2, error: 3 };
    const min = rank[commitCfg.minSeverity] || 2;
    if (findings.some((f) => (rank[f.severity] || 1) >= min)) exitCode = 1;
  }
}
process.exit(exitCode);
