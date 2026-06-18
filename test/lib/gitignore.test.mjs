import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { filterGitIgnored, isGitIgnored } from '../../lib/gitignore.mjs';

// repo git temporal con .gitignore
const repo = mkdtempSync(join(tmpdir(), 'gi-repo-'));
execFileSync('git', ['-C', repo, 'init', '-q']);
writeFileSync(join(repo, '.gitignore'), 'dist/\n*.log\n');
mkdirSync(join(repo, 'dist'), { recursive: true });
mkdirSync(join(repo, 'src'), { recursive: true });
writeFileSync(join(repo, 'dist', 'x.js'), '');
writeFileSync(join(repo, 'app.log'), '');
writeFileSync(join(repo, 'src', 'a.tsx'), '');

const kept = filterGitIgnored(repo, ['dist/x.js', 'app.log', 'src/a.tsx']);
assert.deepEqual(kept, ['src/a.tsx'], `kept=${JSON.stringify(kept)}`);
assert.equal(isGitIgnored(repo, 'dist/x.js'), true);
assert.equal(isGitIgnored(repo, 'src/a.tsx'), false);

// directorio que NO es repo git -> fail-open: devuelve todo, nada ignorado
const plain = mkdtempSync(join(tmpdir(), 'gi-plain-'));
assert.deepEqual(filterGitIgnored(plain, ['a.ts', 'b.ts']), ['a.ts', 'b.ts']);
assert.equal(isGitIgnored(plain, 'a.ts'), false);

// lista vacía no rompe
assert.deepEqual(filterGitIgnored(repo, []), []);

// dir inexistente -> fail-open, nunca lanza
assert.deepEqual(filterGitIgnored('/no/such/dir/xyz', ['a.ts', 'b.ts']), ['a.ts', 'b.ts']);
assert.equal(isGitIgnored('/no/such/dir/xyz', 'a.ts'), false);

console.log('gitignore.test ok');
