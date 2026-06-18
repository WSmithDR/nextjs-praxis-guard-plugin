import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { enumerateFiles } from '../../lib/walk.mjs';

const repo = mkdtempSync(join(tmpdir(), 'walk-gi-'));
execFileSync('git', ['-C', repo, 'init', '-q']);
writeFileSync(join(repo, '.gitignore'), 'generated/\n');
mkdirSync(join(repo, 'src'), { recursive: true });
mkdirSync(join(repo, 'generated'), { recursive: true });
writeFileSync(join(repo, 'src', 'a.ts'), '');
writeFileSync(join(repo, 'generated', 'b.ts'), '');

const cfg = { include: ['.ts'], exclude: [] };
// sin respectGitignore -> ve los dos (comportamiento actual intacto)
const all = enumerateFiles(repo, { ...cfg, respectGitignore: false });
assert.ok(all.includes('generated/b.ts'), 'sin flag, incluye el ignorado');
// con respectGitignore -> excluye generated/b.ts
const kept = enumerateFiles(repo, { ...cfg, respectGitignore: true });
assert.ok(kept.includes('src/a.ts') && !kept.includes('generated/b.ts'), `kept=${JSON.stringify(kept)}`);

console.log('walk-gitignore.test ok');
