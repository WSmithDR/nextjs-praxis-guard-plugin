import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const hookSrc = join(repo, 'bin', 'dev', 'git-hooks', 'post-commit');

const proj = mkdtempSync(join(tmpdir(), 'pc-'));
const git = (args) => execFileSync('git', args, { cwd: proj, encoding: 'utf8' });
const version = () => JSON.parse(readFileSync(join(proj, '.claude-plugin', 'plugin.json'), 'utf8')).version;

git(['init', '-q']);
git(['config', 'user.email', 't@t']);
git(['config', 'user.name', 't']);
mkdirSync(join(proj, '.claude-plugin'), { recursive: true });
writeFileSync(join(proj, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'x', version: '0.1.0' }, null, 2) + '\n');
writeFileSync(join(proj, 'a.txt'), '1');
// commit inicial SIN el hook (toca plugin.json -> de todos modos se saltearía).
git(['add', '-A']);
git(['commit', '-q', '-m', 'chore: init']);

// instalar el hook
copyFileSync(hookSrc, join(proj, '.git', 'hooks', 'post-commit'));
chmodSync(join(proj, '.git', 'hooks', 'post-commit'), 0o755);

// feat: -> minor (0.1.0 -> 0.2.0); el bump entra en el MISMO commit (amend).
writeFileSync(join(proj, 'a.txt'), '2');
git(['add', '-A']);
git(['commit', '-q', '-m', 'feat: algo']);
assert.equal(version(), '0.2.0', `feat got ${version()}`);
assert.ok(git(['show', '--name-only', '--format=', 'HEAD']).includes('.claude-plugin/plugin.json'),
  'el bump debe estar en el commit');

// fix: -> patch (0.2.0 -> 0.2.1). Un solo bump (el guard de recursión funciona).
writeFileSync(join(proj, 'a.txt'), '3');
git(['add', '-A']);
git(['commit', '-q', '-m', 'fix: bug']);
assert.equal(version(), '0.2.1', `fix got ${version()}`);

// BREAKING -> major (0.2.1 -> 1.0.0).
writeFileSync(join(proj, 'a.txt'), '4');
git(['add', '-A']);
git(['commit', '-q', '-m', 'feat!: rompe']);
assert.equal(version(), '1.0.0', `breaking got ${version()}`);

// árbol limpio (el amend no deja nada colgando).
assert.equal(git(['status', '--porcelain']).trim(), '', 'árbol limpio');

console.log('post-commit.test ok');
