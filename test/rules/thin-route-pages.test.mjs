import rule from '../../rules/thin-route-pages.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, maxLines: 30, maxStructuralTags: 2 };
const full = { architecture: { strategy: 'by-feature', featuresDir: 'src/features' } };

// página fina que monta el componente de la feature -> 0 (y respeta route group)
const thin = `import { Dashboard } from '@/features/dashboard';
export default function Page() {
  return <Dashboard />;
}`;
assert.equal(rule(thin, 'app/(app)/dashboard/page.tsx', cfg, full).length, 0, 'página fina ok');

// estado/hooks en la página -> warn
const withHook = `'use client';
import { useState } from 'react';
export default function Page() {
  const [x, setX] = useState(0);
  return <Thing x={x} />;
}`;
const h = rule(withHook, 'app/page.tsx', cfg, full);
assert.equal(h.length, 1);
assert.equal(h[0].severity, 'warn');
assert.ok(/hooks/.test(h[0].message));

// JSX estructural (varios tags HTML) -> warn
const structural = `export default function Page() {
  return (<div><header><h1>Hola</h1></header><main><p>x</p></main></div>);
}`;
assert.equal(rule(structural, 'app/x/page.tsx', cfg, full).length, 1, 'estructura html marca');

// demasiadas líneas -> warn
const big = 'export default function Page(){\n' + 'const a=1;\n'.repeat(40) + 'return <X/>;\n}';
assert.ok(rule(big, 'app/page.tsx', cfg, full).some((f) => /líneas/.test(f.message)));

// archivo que no es app/**/page.tsx -> 0
assert.equal(rule(structural, 'src/features/dashboard/Dashboard.tsx', cfg, full).length, 0, 'solo app/**/page');
// sin strategy declarada -> no corre (opt-in)
assert.equal(rule(withHook, 'app/page.tsx', cfg, { architecture: { strategy: null } }).length, 0, 'requiere strategy');
// disabled
assert.equal(rule(withHook, 'app/page.tsx', { enabled: false }, full).length, 0);
console.log('thin-route-pages.test ok');
