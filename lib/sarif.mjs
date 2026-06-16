// lib/sarif.mjs
// Traduce findings { rule, file, line, severity, message } a SARIF 2.1.0.
// Puro y determinista: orden estable, sin timestamps, paths relativos.
import { findingFingerprint } from './baseline.mjs';

const SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const LEVEL = { info: 'note', warn: 'warning', error: 'error' };

export function toSarif(findings, { toolName = 'nextjs-praxis-guard', toolVersion = '0.0.0', informationUri = 'https://github.com/WSmithDR/nextjs-praxis-guard-plugin' } = {}) {
  const sorted = [...findings].sort((a, b) =>
    String(a.file).localeCompare(String(b.file))
    || ((a.line ?? 0) - (b.line ?? 0))
    || String(a.rule).localeCompare(String(b.rule))
    || String(a.message).localeCompare(String(b.message)));

  const ruleIds = [...new Set(sorted.map((f) => f.rule))].sort();
  const rules = ruleIds.map((id) => ({ id, name: id }));

  const results = sorted.map((f) => {
    const physicalLocation = { artifactLocation: { uri: String(f.file) } };
    if (f.line != null) physicalLocation.region = { startLine: f.line };
    return {
      ruleId: f.rule,
      level: LEVEL[f.severity] || 'note',
      message: { text: String(f.message) },
      locations: [{ physicalLocation }],
      partialFingerprints: { praxisFingerprint: findingFingerprint(f) },
    };
  });

  return {
    $schema: SCHEMA,
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: toolName, version: toolVersion, informationUri, rules } },
      results,
    }],
  };
}
