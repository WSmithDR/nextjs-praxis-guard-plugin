// lib/findings.mjs
// Formats Finding[] into a concise, agent-readable block. Empty -> "".
export function formatFindings(findings, filePath) {
  if (!Array.isArray(findings) || findings.length === 0) return '';
  const lines = findings.map((f) => {
    const loc = f.line ? `${f.rule}:${f.line}` : f.rule;
    return `  [${f.severity}] ${loc} — ${f.message}`;
  });
  return `⚠️ praxis-guard — ${filePath}\n${lines.join('\n')}`;
}
