// hooks/praxis-session-offer.mjs
// SessionStart (Claude Code): offer the praxis-config skill when a Next.js project
// has no .praxis-guard/config.json. Non-blocking: ALWAYS exit 0. One-time per project
// via an OS-temp marker keyed by the project path (never writes into the repo).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

function isNextProject(cwd) {
  if (existsSync(join(cwd, 'next.config.js')) ||
      existsSync(join(cwd, 'next.config.mjs')) ||
      existsSync(join(cwd, 'next.config.ts'))) return true;
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    return Boolean((pkg.dependencies && pkg.dependencies.next) ||
                   (pkg.devDependencies && pkg.devDependencies.next));
  } catch { return false; }
}

function markerPath(cwd) {
  const h = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
  return join(tmpdir(), `praxis-guard-offered-${h}`);
}

try {
  const cwd = process.cwd();
  if (isNextProject(cwd) &&
      !existsSync(join(cwd, '.praxis-guard', 'config.json'))) {
    const marker = markerPath(cwd);
    if (!existsSync(marker)) {
      writeFileSync(marker, cwd);
      process.stdout.write(
        'praxis-guard: este proyecto Next.js no tiene config propia. ' +
        'Para elegir qué reglas corren, invocá la skill `praxis-config`.\n'
      );
    }
  }
} catch { /* never block the session */ }
process.exit(0);
