import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { suggestExcludeDirs } from '../../lib/exclude-candidates.mjs';

const dir = mkdtempSync(join(tmpdir(), 'exc-'));
mkdirSync(join(dir, '.todo'));
mkdirSync(join(dir, '.claude'));
mkdirSync(join(dir, 'src'));
writeFileSync(join(dir, 'src', 'a.tsx'), '');     // src tiene código -> NO se sugiere
mkdirSync(join(dir, 'assets'));
writeFileSync(join(dir, 'assets', 'logo.png'), ''); // sin código -> se sugiere
mkdirSync(join(dir, 'node_modules'));               // ya excluido -> NO se sugiere

const cfg = { include: ['.tsx', '.ts'], exclude: ['node_modules/'] };
const got = suggestExcludeDirs(dir, cfg);
assert.deepEqual(got, ['.claude', '.todo', 'assets'], `got=${JSON.stringify(got)}`);

// sin config.include no inventa por "falta de código"; solo dot-dirs de tooling conocidos
const got2 = suggestExcludeDirs(dir, { exclude: [] });
assert.ok(got2.includes('.todo') && got2.includes('.claude'), `got2=${JSON.stringify(got2)}`);
assert.ok(!got2.includes('src'), 'src nunca se sugiere');

console.log('exclude-candidates.test ok');
