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

// --- Next App Router: route groups, slots, dynamic ---
const pageCfg = { enabled: true, placement: [
  { kind: 'page', match: '^page\\.tsx$', allowed: ['app/**'] },
]};
// regression: app/** matchea (group), @slot, [slug], [...all]
for (const p of ['app/(marketing)/page.tsx', 'app/@modal/page.tsx', 'app/blog/[slug]/page.tsx', 'app/[...all]/page.tsx']) {
  assert.equal(rule('x', p, pageCfg, full).length, 0, `app/** debe matchear ${p}`);
}
// route group transparente: allowed canónico (app/about/**) acepta el archivo bajo (marketing)
const canonCfg = { enabled: true, placement: [
  { kind: 'page', match: '^page\\.tsx$', allowed: ['app/about/**'] },
]};
assert.equal(rule('x', 'app/(marketing)/about/page.tsx', canonCfg, full).length, 0, 'colapsa (marketing) -> app/about');
// pero un slot/dynamic NO se colapsa: app/about/** no acepta app/dashboard/page.tsx
assert.equal(rule('x', 'app/(marketing)/dashboard/page.tsx', canonCfg, full).length, 1, 'dashboard sigue fuera de about');
console.log('folder-placement.test ok');
