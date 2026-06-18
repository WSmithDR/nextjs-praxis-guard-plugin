// lib/gitignore.mjs
// Filtra/chequea archivos ignorados por git. Fail-open: sin git / sin repo / error -> no ignora nada.
import { execFileSync } from 'node:child_process';

function insideRepo(dir) {
  try {
    execFileSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

// Set de los relPaths ignorados (subconjunto de los pasados). `git check-ignore --stdin`
// imprime los ignorados (uno por línea); exit 1 = ninguno (execFileSync tira -> leemos e.stdout).
function ignoredSet(dir, relPaths) {
  let out = '';
  try {
    out = execFileSync('git', ['-C', dir, 'check-ignore', '--stdin'],
      { input: relPaths.join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (e) {
    out = (e && typeof e.stdout === 'string') ? e.stdout : '';
  }
  return new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
}

export function filterGitIgnored(dir, relPaths) {
  if (!relPaths || !relPaths.length) return relPaths || [];
  if (!insideRepo(dir)) return relPaths;
  const ignored = ignoredSet(dir, relPaths);
  return relPaths.filter((p) => !ignored.has(p));
}

export function isGitIgnored(dir, relPath) {
  if (!relPath) return false;
  if (!insideRepo(dir)) return false;
  return ignoredSet(dir, [relPath]).has(relPath);
}
