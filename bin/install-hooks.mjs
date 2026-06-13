// bin/install-hooks.mjs
// Wires the non-auto-loading CLIs (copilot|codex|opencode) into a target project,
// rewriting the path to this plugin's hooks so the hook can find detect.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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
  default:
    console.error('usage: node bin/install-hooks.mjs --target <dir> --cli <copilot|codex|opencode>');
    process.exit(1);
}
