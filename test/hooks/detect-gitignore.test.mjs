import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runDetector } from '../../hooks/detect.mjs';

const repo = mkdtempSync(join(tmpdir(), 'detect-gi-'));
execFileSync('git', ['-C', repo, 'init', '-q']);
writeFileSync(join(repo, '.gitignore'), 'generated/\n');
mkdirSync(join(repo, 'generated'), { recursive: true });
// archivo con una mala praxis obvia (secret) que normalmente dispara findings
const bad = 'const k = "sk_live_ABCDEFGHIJKLMNOP";\n';
writeFileSync(join(repo, 'generated', 'leak.ts'), bad);

const cfg = { include: ['.ts'], exclude: [], rules: { secrets: { enabled: true } }, detected: { typescript: false, tailwind: false } };

// sin respectGitignore -> detecta el secret
const on = runDetector('generated/leak.ts', { content: bad, config: { ...cfg, respectGitignore: false }, cwd: repo });
assert.ok(on.findings.length > 0, 'sin flag, detecta');
// con respectGitignore -> el archivo está ignorado -> sin findings
const off = runDetector('generated/leak.ts', { content: bad, config: { ...cfg, respectGitignore: true }, cwd: repo });
assert.equal(off.findings.length, 0, 'archivo ignorado por git -> no audita');

console.log('detect-gitignore.test ok');
