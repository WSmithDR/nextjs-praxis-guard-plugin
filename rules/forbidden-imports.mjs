// rules/forbidden-imports.mjs
// Configurable import blocklist. Empty by default -> never fires.
// Cada entrada admite `allowDirs`: el módulo solo se permite desde esas carpetas
// (boundary by-feature). Si el archivo está bajo un allowDir, el import no se marca.
const IMPORT_RE = /^\s*(?:import\b[^'"]*|export\b[^'"]*from\s*|.*\brequire\s*\()\s*['"]([^'"]+)['"]/;

// segment-aware: '/lib/motion/' debe aparecer como run de segmentos completos en el path.
function inAllowedDir(path, allowDirs) {
  if (!Array.isArray(allowDirs) || allowDirs.length === 0) return false;
  const p = '/' + path.replace(/\\/g, '/').replace(/^\/+/, '') + '/';
  return allowDirs.some((d) => p.includes('/' + String(d).replace(/^\/+|\/+$/g, '') + '/'));
}

export default function forbiddenImports(content, filePath = '', config = {}) {
  if (config.enabled === false) return [];
  const list = config.list || [];
  if (list.length === 0) return [];
  const path = String(filePath);
  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = IMPORT_RE.exec(lines[i]);
    if (!m) continue;
    const source = m[1];
    for (const entry of list) {
      if (!entry || !entry.module) continue;
      if (source === entry.module || source.startsWith(entry.module + '/')) {
        if (inAllowedDir(path, entry.allowDirs)) break;   // import permitido desde esta carpeta
        out.push({ rule: 'forbidden-imports', line: i + 1, severity: 'warn',
          message: `Import prohibido "${source}": ${entry.message || 'usá la alternativa del proyecto.'}` });
        break;
      }
    }
  }
  return out;
}
