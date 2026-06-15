// rules/tsconfig-strictness.mjs
// Project rule (TS): el tsconfig no fuerza la estrictez del baseline elegido por el dev.
import { computeMissing } from '../lib/tsconfig-fix.mjs';

export default function tsconfigStrictness(tree, full = {}) {
  const cfg = (full.rules && full.rules['tsconfig-strictness']) || {};
  if (cfg.enabled === false) return [];
  const det = full.detected || {};
  if (!det.typescript || det.tsconfigOptions == null) return [];
  const baseline = cfg.baseline || ['strict', 'noImplicitAny'];

  const missing = computeMissing(det.tsconfigOptions, baseline);
  return missing.map((flag) => ({
    rule: 'tsconfig-strictness', severity: 'warn', file: 'tsconfig.json',
    message: `tsconfig no fuerza "${flag}". Activalo para que el linter pueda cazar estos problemas.`,
  }));
}
