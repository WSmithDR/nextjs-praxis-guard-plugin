import { readFileSync } from 'node:fs';
import rule from '../../rules/file-responsibility.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, maxLines: 400, mixedSignalsLines: 200 };
const big = readFileSync(new URL('../fixtures/file-responsibility/bad/big.tsx', import.meta.url), 'utf8');
const clean = readFileSync(new URL('../fixtures/file-responsibility/good/clean.tsx', import.meta.url), 'utf8');

const bigF = rule(big, 'big.tsx', cfg);
assert.ok(bigF.some((f) => f.message.includes('líneas')), 'flags line count');
assert.ok(bigF.some((f) => /responsabilidad/i.test(f.message)), 'mixed-signals nudge');
assert.ok(bigF.every((f) => f.rule === 'file-responsibility'));

assert.equal(rule(clean, 'clean.tsx', cfg).length, 0, 'small clean file is fine');

// overrides por glob: un umbral más bajo para utils dispara donde el global no
const src120 = Array.from({ length: 120 }, (_, i) => `const x${i} = ${i};`).join('\n');
const baseCfg = { enabled: true, maxLines: 400, mixedSignalsLines: 200 };
assert.equal(rule(src120, 'src/lib/util.ts', baseCfg).length, 0, 'sin override: 120 < 400');
const ovCfg = { ...baseCfg, overrides: [{ glob: '**/lib/**', maxLines: 100 }] };
const ov = rule(src120, 'src/lib/util.ts', ovCfg);
assert.ok(ov.some((f) => f.message.includes('líneas')), 'override baja el umbral a 100');
// archivo fuera del glob conserva el umbral global
assert.equal(rule(src120, 'src/components/Big.tsx', ovCfg).length, 0, 'fuera del glob usa el global');
// último override que matchea gana
const ovLast = { ...baseCfg, overrides: [{ glob: '**/lib/**', maxLines: 100 }, { glob: '**/util.ts', maxLines: 500 }] };
assert.equal(rule(src120, 'src/lib/util.ts', ovLast).length, 0, 'último match (500) gana');
console.log('file-responsibility.test ok');
