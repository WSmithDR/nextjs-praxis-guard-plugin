import { readFileSync } from 'node:fs';
import rule from '../../rules/forbidden-imports.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, list: [
  { module: 'framer-motion', message: 'Usá tu wrapper @/lib/motion.' },
  { module: '@supabase/supabase-js', message: 'Importá el singleton @/lib/supabase.' },
]};

const bad = readFileSync(new URL('../fixtures/forbidden-imports/bad/uses.ts', import.meta.url), 'utf8');
const good = readFileSync(new URL('../fixtures/forbidden-imports/good/ok.ts', import.meta.url), 'utf8');

const badF = rule(bad, 'uses.ts', cfg);
assert.equal(badF.length, 2, `expected 2, got ${badF.length}`);
assert.ok(badF[0].message.includes('wrapper'));
assert.equal(rule(good, 'ok.ts', cfg).length, 0);
assert.equal(rule(bad, 'uses.ts', { enabled: true, list: [] }).length, 0);

// regression: must not flag react-dom when only "react" is blocked
const reactCfg = { enabled: true, list: [{ module: 'react', message: 'blocked' }] };
assert.equal(rule('import X from "react-dom";', 'a.ts', reactCfg).length, 0, 'react-dom not flagged by react');
assert.equal(rule('import X from "react";', 'a.ts', reactCfg).length, 1, 'exact react flagged');
assert.equal(rule('import X from "react/jsx-runtime";', 'a.ts', reactCfg).length, 1, 'react subpath flagged');
console.log('forbidden-imports.test ok');
