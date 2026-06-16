// bin/install-hooks.mjs
// Wires the non-auto-loading CLIs (copilot|codex|opencode) into a target project,
// rewriting the path to this plugin's hooks so the hook can find detect.mjs.
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`)) ||
            (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : null);
  return a ? a.replace(`--${name}=`, '') : def;
}

const target = resolve(arg('target', process.cwd()));
const cli = arg('cli');
const adapter = join(PLUGIN_ROOT, 'hooks', 'hook-adapter.mjs');

function writeHookFile(destDir, fileName, srcRel, cliName) {
  mkdirSync(destDir, { recursive: true });
  let json = readFileSync(join(PLUGIN_ROOT, srcRel), 'utf8')
    .replace(/\$\(git rev-parse --show-toplevel\)\/hooks\/hook-adapter\.mjs/g, adapter);
  const dest = join(destDir, fileName);
  writeFileSync(dest, json);
  console.log(`installed ${cliName} hook -> ${dest}`);
}

function pluginGitUrl() {
  let url;
  try { url = execSync('git remote get-url origin', { cwd: PLUGIN_ROOT, encoding: 'utf8' }).trim(); }
  catch { return '<PLUGIN_GIT_URL>'; }
  // El CI no tiene SSH key: normalizamos a HTTPS para que un repo público clone solo.
  url = url.replace(/^git@([^:]+):/, 'https://$1/');        // git@github.com:o/r.git
  url = url.replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/'); // ssh://git@github.com/o/r.git
  return url;
}
function pluginRef() {
  try {
    const m = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    return m.version ? `v${m.version}` : 'main';
  } catch { return 'main'; }
}

switch (cli) {
  case 'copilot':
    writeHookFile(join(target, '.github', 'hooks'), 'praxis-guard.json', 'cli/copilot-hooks.json', 'copilot');
    break;
  case 'codex':
    writeHookFile(join(target, '.codex'), 'hooks.json', 'cli/codex-hooks.json', 'codex');
    break;
  case 'opencode': {
    const destDir = join(target, '.opencode', 'plugins');
    mkdirSync(destDir, { recursive: true });
    const detect = join(PLUGIN_ROOT, 'hooks', 'detect.mjs');
    const body = readFileSync(join(PLUGIN_ROOT, 'cli/opencode-plugin.mjs'), 'utf8')
      .replace('"../../hooks/detect.mjs"', JSON.stringify(detect));
    const dest = join(destDir, 'praxis-guard.mjs');
    writeFileSync(dest, body);
    console.log(`installed opencode plugin -> ${dest}`);
    break;
  }
  case 'precommit': {
    const hooksDir = join(target, '.git', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const audit = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');
    const dest = join(hooksDir, 'pre-commit');
    const body = `#!/bin/sh\n# praxis-guard pre-commit (auto-instalado)\nnode ${JSON.stringify(audit)} --staged --dir "$(git rev-parse --show-toplevel)"\n`;
    writeFileSync(dest, body);
    chmodSync(dest, 0o755);
    console.log(`installed pre-commit hook -> ${dest}`);
    break;
  }
  case 'github-action': {
    const destDir = join(target, '.github', 'workflows');
    mkdirSync(destDir, { recursive: true });
    const body = readFileSync(join(PLUGIN_ROOT, 'cli/github-action.yml'), 'utf8')
      .replace(/__PLUGIN_URL__/g, pluginGitUrl())
      .replace(/__PLUGIN_REF__/g, pluginRef());
    const dest = join(destDir, 'praxis-audit.yml');
    writeFileSync(dest, body);
    console.log(`installed github-action workflow -> ${dest}`);
    break;
  }
  default:
    console.error('usage: node bin/install-hooks.mjs --target <dir> --cli <copilot|codex|opencode|precommit|github-action>');
    process.exit(1);
}
