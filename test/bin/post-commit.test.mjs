import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const hookSrc = join(repo, 'bin', 'dev', 'git-hooks', 'post-commit');
const bumperSrc = join(repo, 'bin', 'bump-version.py');

const proj = mkdtempSync(join(tmpdir(), 'pc-'));
const git = (args) => execFileSync('git', args, { cwd: proj, encoding: 'utf8' });
const verOf = (rel) => JSON.parse(readFileSync(join(proj, rel), 'utf8')).version;

git(['init', '-q']);
git(['config', 'user.email', 't@t']);
git(['config', 'user.name', 't']);
mkdirSync(join(proj, '.claude-plugin'), { recursive: true });
mkdirSync(join(proj, '.codex-plugin'), { recursive: true });
mkdirSync(join(proj, 'bin'), { recursive: true });
writeFileSync(join(proj, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'x', version: '0.1.0' }, null, 2) + '\n');
writeFileSync(join(proj, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'x', version: '0.1.0' }, null, 2) + '\n');
copyFileSync(bumperSrc, join(proj, 'bin', 'bump-version.py'));
writeFileSync(join(proj, 'a.txt'), '1');
// commit inicial SIN el hook (además toca plugin.json -> el hook lo saltearía).
git(['add', '-A']);
git(['commit', '-q', '-m', 'chore: init']);

// instalar el hook
copyFileSync(hookSrc, join(proj, '.git', 'hooks', 'post-commit'));
chmodSync(join(proj, '.git', 'hooks', 'post-commit'), 0o755);

// feat: -> minor; propaga a TODOS los manifiestos en el MISMO commit (sin drift).
writeFileSync(join(proj, 'a.txt'), '2');
git(['add', '-A']);
git(['commit', '-q', '-m', 'feat: algo']);
assert.equal(verOf('.claude-plugin/plugin.json'), '0.2.0', 'claude bump');
assert.equal(verOf('.codex-plugin/plugin.json'), '0.2.0', 'codex sincronizado (sin drift)');
assert.ok(git(['show', '--name-only', '--format=', 'HEAD']).includes('.codex-plugin/plugin.json'),
  'el bump del codex entró en el commit');

// fix: -> patch (0.2.0 -> 0.2.1), un solo bump (guard de recursión).
writeFileSync(join(proj, 'a.txt'), '3');
git(['add', '-A']);
git(['commit', '-q', '-m', 'fix: bug']);
assert.equal(verOf('.claude-plugin/plugin.json'), '0.2.1');
assert.equal(verOf('.codex-plugin/plugin.json'), '0.2.1');

// árbol limpio (el amend no deja nada colgando).
assert.equal(git(['status', '--porcelain']).trim(), '', 'árbol limpio');

console.log('post-commit.test ok');
