// lib/findings.mjs
// Formats Finding[] into a concise, agent-readable block. Empty -> "".
export function formatFindings(findings, filePath) {
  if (!Array.isArray(findings) || findings.length === 0) return '';
  const lines = findings.map((f) => {
    const loc = f.line != null ? `${f.rule}:${f.line}` : f.rule;
    return `  [${f.severity}] ${loc} — ${f.message}`;
  });
  return `⚠️ praxis-guard — ${filePath}\n${lines.join('\n')}`;
}

// Resumen-primero para la auditoría: conteo por severidad, por regla y top archivos.
// Un volumen grande de findings sin priorización es un muro; esto lo hace accionable.
const SEV_ORDER = ['error', 'warn', 'info'];

export function summarizeFindings(findings, { topFiles = 10 } = {}) {
  if (!Array.isArray(findings) || findings.length === 0) return '';
  const bySev = {}, byRule = {}, byFile = {};
  for (const f of findings) {
    const sev = f.severity || 'info';
    bySev[sev] = (bySev[sev] || 0) + 1;
    byRule[f.rule] = (byRule[f.rule] || 0) + 1;
    const file = f.file || '(proyecto)';
    byFile[file] = (byFile[file] || 0) + 1;
  }
  const pad = (n) => String(n).padStart(4);
  const lines = ['── Resumen ──'];
  const sevStr = [...SEV_ORDER, ...Object.keys(bySev).filter((s) => !SEV_ORDER.includes(s))]
    .filter((s) => bySev[s]).map((s) => `${s}: ${bySev[s]}`).join('   ');
  lines.push(`Severidad: ${sevStr}`);
  lines.push('Por regla:');
  for (const [r, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) lines.push(`  ${pad(n)}  ${r}`);
  const files = Object.entries(byFile).sort((a, b) => b[1] - a[1]);
  if (files.length > 1) {
    lines.push(`Top archivos${files.length > topFiles ? ` (${topFiles} de ${files.length})` : ''}:`);
    for (const [file, n] of files.slice(0, topFiles)) lines.push(`  ${pad(n)}  ${file}`);
  }
  return lines.join('\n');
}
