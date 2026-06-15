import rule from '../../rules/architecture-coherence.mjs';
import assert from 'node:assert/strict';

const tree = (dirs) => ({ files: [], dirs: new Set(dirs) });

// by-feature con src/components global intruso -> finding
const full1 = { architecture: { strategy: 'by-feature', root: 'src', featuresDir: 'src/features', sharedDirs: ['src/shared'] }, rules: { 'architecture-coherence': { enabled: true } } };
const bad = rule(tree(['src', 'src/components', 'src/features', 'src/features/cart']), full1);
assert.ok(bad.length >= 1, 'esperaba al menos 1 finding');
assert.equal(bad[0].rule, 'architecture-coherence');

// by-feature limpio -> 0
assert.equal(rule(tree(['src', 'src/features', 'src/features/cart', 'src/shared']), full1).length, 0);

// by-layer con featuresDir presente -> finding
const full2 = { architecture: { strategy: 'by-layer', root: 'src', featuresDir: 'src/features', sharedDirs: [] }, rules: { 'architecture-coherence': { enabled: true } } };
assert.ok(rule(tree(['src', 'src/domain', 'src/features']), full2).length >= 1);

// sin strategy -> 0
const full3 = { architecture: { strategy: null }, rules: { 'architecture-coherence': { enabled: true } } };
assert.equal(rule(tree(['src', 'src/components']), full3).length, 0);
console.log('architecture-coherence.test ok');
