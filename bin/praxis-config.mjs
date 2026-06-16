// bin/praxis-config.mjs
// Deterministic CLI behind the praxis-config skill. Zero-dep ESM.
//   show  [--dir <project>]  -> prints current .praxis-guard/config.json (or "{}")
//   write [--dir <project>]  -> reads a config object from stdin, validates, writes
//                               .praxis-guard/config.json atomically + stamps meta.json
// NOTE: this is a normal Node CLI (not a workflow script), so `new Date()` is fine here.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { validateConfig } from '../lib/validate-config.mjs';
import { loadCustomRules, readCustomRuleSources } from '../lib/custom-rules.mjs';
import { loadConfig, defaultProjectConfigPath } from '../lib/config.mjs';
import { rulesFingerprint } from '../lib/fingerprint.mjs';
import { writeMeta } from '../lib/meta.mjs';
import { RULES, PROJECT_RULES, AST_RULES } from '../rules/index.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def) {
  const eq = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

function readStdin() {
  return new Promise((res) => {
    let d = '';
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => res(d));
    process.stdin.on('error', () => res(''));
    if (process.stdin.isTTY) res('');
  });
}

function pluginVersion() {
  try {
    const m = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    return m.version || '0.0.0';
  } catch { return '0.0.0'; }
}

function gitUser(dir) {
  try { return execSync('git config user.name', { cwd: dir, encoding: 'utf8' }).trim() || 'unknown'; }
  catch { return 'unknown'; }
}

function writeAtomic(path, text) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

const cmd = process.argv[2];
const dir = resolve(arg('dir', process.cwd()));
const configDir = join(dir, '.praxis-guard');
const configPath = join(configDir, 'config.json');
const metaPath = join(configDir, 'meta.json');

if (cmd === 'show') {
  process.stdout.write(existsSync(configPath) ? readFileSync(configPath, 'utf8') : '{}\n');
  process.exit(0);
}

if (cmd === 'write') {
  const raw = await readStdin();
  let obj;
  try { obj = JSON.parse(raw || '{}'); }
  catch { console.error('praxis-config: JSON inválido en stdin'); process.exit(1); }
  const custom = await loadCustomRules(dir);
  const customIds = [...Object.keys(custom.fileRules), ...Object.keys(custom.projectRules), ...Object.keys(custom.astRules)];
  const { ok, errors } = validateConfig(obj, customIds);
  if (!ok) { console.error('praxis-config: config inválida:\n  - ' + errors.join('\n  - ')); process.exit(1); }
  mkdirSync(configDir, { recursive: true });
  writeAtomic(configPath, JSON.stringify(obj, null, 2) + '\n');
  const merged = loadConfig({ projectConfigPath: defaultProjectConfigPath(dir), override: obj });
  writeMeta(dir, {
    configured_by: gitUser(dir),
    configured_at: new Date().toISOString().slice(0, 10),
    plugin_version: pluginVersion(),
    schema_version: 1,
    reviewed_rules: [...Object.keys(RULES), ...Object.keys(PROJECT_RULES), ...Object.keys(AST_RULES), ...customIds].sort(),
    rules_fingerprint: rulesFingerprint(merged, readCustomRuleSources(dir)),
  });
  console.log(`praxis-config: escrito ${configPath}`);
  process.exit(0);
}

console.error('uso: node bin/praxis-config.mjs <show|write> [--dir <proyecto>]');
process.exit(1);
