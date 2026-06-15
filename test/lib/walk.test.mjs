import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enumerateFiles, buildProjectTree } from '../../lib/walk.mjs';
import assert from 'node:assert/strict';

const root = mkdtempSync(join(tmpdir(), 'praxis-walk-'));
try {
  mkdirSync(join(root, 'src', 'features', 'cart'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), 'x');
  writeFileSync(join(root, 'src', 'features', 'cart', 'b.tsx'), 'x');
  writeFileSync(join(root, 'src', 'readme.md'), 'x');           // fuera de include
  writeFileSync(join(root, 'node_modules', 'x', 'c.ts'), 'x');  // excluido

  const cfg = { include: ['.ts', '.tsx'], exclude: ['node_modules/'] };
  const files = enumerateFiles(root, cfg);
  assert.deepEqual(files, ['src/a.ts', 'src/features/cart/b.tsx']);

  const tree = buildProjectTree(files);
  assert.ok(tree.dirs.has('src'));
  assert.ok(tree.dirs.has('src/features/cart'));
  assert.ok(!tree.dirs.has('node_modules'));
  console.log('walk.test ok');
} finally { rmSync(root, { recursive: true, force: true }); }
