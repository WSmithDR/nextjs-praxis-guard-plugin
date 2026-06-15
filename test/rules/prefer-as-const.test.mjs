import rule from '../../rules/prefer-as-const.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };
const full = { detected: { typescript: true } };

// objeto de constantes en MAYÚSCULAS sin as const -> finding
const bad = "const STATUS = { ACTIVE: 'active', PENDING: 'pending' };";
const out = rule(bad, 'a.ts', cfg, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'prefer-as-const');

// con as const -> 0
assert.equal(rule("const STATUS = { ACTIVE: 'active' } as const;", 'a.ts', cfg, full).length, 0);
// objeto normal en minúscula (no mapa de constantes) -> 0
assert.equal(rule("const config = { url: 'x' };", 'a.ts', cfg, full).length, 0);
console.log('prefer-as-const.test ok');
