import { runDetector } from '../hooks/detect.mjs';
import assert from 'node:assert/strict';

// Una regla de prueba que reporta lo que ve en full.detected.
// Reusamos una regla real luego; acá validamos el plumbing con un config inline.
const cfg = {
  include: ['.ts', '.tsx'], exclude: [],
  detected: undefined,
  rules: {},
};
// runDetector debe ASIGNAR cfg.detected si no vino (desde el cwd del proceso).
const { } = runDetector('noexiste.ts', { content: 'const a = 1;', config: cfg });
assert.ok(cfg.detected && typeof cfg.detected === 'object', 'runDetector inyecta detected');
assert.ok('typescript' in cfg.detected && 'tailwind' in cfg.detected);
console.log('detect-injects-stack.test ok');
