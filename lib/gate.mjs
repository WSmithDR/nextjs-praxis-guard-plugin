// lib/gate.mjs
// Decide el exit code de un gate (pre-commit / CI) según commit.minSeverity.
const RANK = { info: 1, warn: 2, error: 3 };

export function gateExitCode(findings, config = {}) {
  const commit = config.commit || {};
  const min = RANK[commit.minSeverity] || 2;   // default warn
  return findings.some((f) => (RANK[f.severity] || 1) >= min) ? 1 : 0;
}
