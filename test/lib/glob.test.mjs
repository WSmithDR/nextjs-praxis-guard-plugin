import { matchGlob } from '../../lib/glob.mjs';
import assert from 'node:assert/strict';

assert.ok(matchGlob('src/features/checkout/hooks/useCart.ts', '**/hooks/**'));
assert.ok(matchGlob('src/hooks/useX.ts', '**/hooks/**'));
assert.ok(!matchGlob('src/components/Button.tsx', '**/hooks/**'));
assert.ok(matchGlob('src/app/page.tsx', 'src/app/**'));
assert.ok(!matchGlob('lib/app/page.tsx', 'src/app/**'));
assert.ok(matchGlob('a/b.ts', 'a/*.ts'));
assert.ok(!matchGlob('a/b/c.ts', 'a/*.ts')); // * no cruza /
console.log('glob.test ok');
