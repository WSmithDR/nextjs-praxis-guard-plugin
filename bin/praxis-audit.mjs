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
const sinceArg = arg('since', null);

let mode, targets = null;
if (forceFull) {
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
} else {
  findings = runFileRules(targets);
  const ref = sinceArg || meta.last_audited_commit;
  if (structuralChanged(dir, ref)) { findings = [...findings, ...runProjectRules()]; ranProject = true; }
}

report(findings);
console.log(`praxis-audit: modo ${mode}${ranProject ? ' (con project rules)' : ''}.`);

// Avanzar el estado tras full/incremental.
const h = head(dir);
if (h) writeMeta(dir, { last_audited_commit: h, rules_fingerprint: fp, plugin_version: ver });

process.exit(0);
