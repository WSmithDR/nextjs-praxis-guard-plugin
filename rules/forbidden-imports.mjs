// rules/forbidden-imports.mjs
// Configurable import blocklist. Empty by default -> never fires.
const IMPORT_RE = /^\s*(?:import\b[^'"]*|export\b[^'"]*from\s*|.*\brequire\s*\()\s*['"]([^'"]+)['"]/;

export default function forbiddenImports(content, _filePath, config = {}) {
  if (config.enabled === false) return [];
  const list = config.list || [];
  if (list.length === 0) return [];
  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = IMPORT_RE.exec(lines[i]);
    if (!m) continue;
    const source = m[1];
    for (const entry of list) {
      if (!entry || !entry.module) continue;
      if (source === entry.module || source.startsWith(entry.module + '/')) {
        out.push({ rule: 'forbidden-imports', line: i + 1, severity: 'warn',
          message: `Import prohibido "${source}": ${entry.message || 'usá la alternativa del proyecto.'}` });
        break;
      }
    }
  }
  return out;
}
