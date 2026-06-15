import rule from '../../rules/feature-deps.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, publicEntry: ['index.ts', 'index.tsx'] };
const full = { architecture: { strategy: 'by-feature', featuresDir: 'src/features' } };

// checkout importa interno de catalog -> prohibido
const bad = rule("import { x } from '@/features/catalog/internal/util';", 'src/features/checkout/ui/Page.tsx', cfg, full);
assert.equal(bad.length, 1, `got ${bad.length}`);
assert.equal(bad[0].rule, 'feature-deps');

// checkout importa API pública de catalog (su raíz) -> permitido
assert.equal(rule("import { x } from '@/features/catalog';", 'src/features/checkout/ui/Page.tsx', cfg, full).length, 0);

// import dentro de la MISMA feature -> permitido
assert.equal(rule("import { y } from '@/features/checkout/lib/y';", 'src/features/checkout/ui/Page.tsx', cfg, full).length, 0);

// archivo fuera de featuresDir -> no corre
assert.equal(rule("import { x } from '@/features/catalog/internal/util';", 'src/app/page.tsx', cfg, full).length, 0);
console.log('feature-deps.test ok');
