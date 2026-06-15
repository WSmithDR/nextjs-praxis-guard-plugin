import rule from '../../rules/layer-boundaries.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, layers: [
  { name: 'domain', path: 'src/domain', mayImport: [] },
  { name: 'infra',  path: 'src/infra',  mayImport: ['domain'] },
  { name: 'ui',     path: 'src/ui',     mayImport: ['domain', 'infra'] },
]};
const full = { architecture: { strategy: 'by-layer' } };

// domain importando infra -> prohibido
const bad = rule("import { db } from '@/infra/db';", 'src/domain/user.ts', cfg, full);
assert.equal(bad.length, 1, `got ${bad.length}`);
assert.equal(bad[0].rule, 'layer-boundaries');
assert.equal(bad[0].line, 1);

// ui importando domain -> permitido
assert.equal(rule("import { U } from '@/domain/user';", 'src/ui/Page.tsx', cfg, full).length, 0);

// import a algo fuera de capas conocidas -> ignorado
assert.equal(rule("import x from 'react';", 'src/domain/user.ts', cfg, full).length, 0);

// archivo fuera de toda capa -> ignorado
assert.equal(rule("import { db } from '@/infra/db';", 'scripts/seed.ts', cfg, full).length, 0);

// sin strategy -> no corre
assert.equal(rule("import { db } from '@/infra/db';", 'src/domain/user.ts', cfg, { architecture: {} }).length, 0);
console.log('layer-boundaries.test ok');
