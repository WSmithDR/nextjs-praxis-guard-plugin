import { readFileSync } from 'node:fs';
import rule from '../../rules/folder-placement.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, placement: [
  { kind: 'hook', match: '^use[A-Z]', allowed: ['**/hooks/**'] },
  { kind: 'server-action', match: "'use server'", allowed: ['**/_actions/**'] },
]};
const full = { architecture: { strategy: 'by-feature' } };
const src = readFileSync(new URL('../fixtures/folder-placement/bad/useCart.ts', import.meta.url), 'utf8');

// hook fuera de **/hooks/** -> 1 finding
const bad = rule(src, 'src/components/useCart.ts', cfg, full);
assert.equal(bad.length, 1, `esperaba 1, got ${bad.length}`);
assert.equal(bad[0].rule, 'folder-placement');
assert.equal(bad[0].severity, 'warn');

// hook en su carpeta -> 0
assert.equal(rule(src, 'src/features/cart/hooks/useCart.ts', cfg, full).length, 0);

// sin strategy declarada -> regla no corre
assert.equal(rule(src, 'src/components/useCart.ts', cfg, { architecture: { strategy: null } }).length, 0);

// server-action por señal de contenido, fuera de _actions -> 1
const sa = rule("'use server'\nexport async function x(){}", 'src/lib/x.ts', cfg, full);
assert.equal(sa.length, 1);
console.log('folder-placement.test ok');
