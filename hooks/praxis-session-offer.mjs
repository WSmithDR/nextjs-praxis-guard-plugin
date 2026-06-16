// hooks/praxis-session-offer.mjs
// SessionStart (Claude Code): offer the praxis-config skill when a Next.js project
// has no .praxis-guard/config.json. Non-blocking: ALWAYS exit 0. One-time per project
// via an OS-temp marker keyed by the project path (never writes into the repo).
// Also: if config exists but registered rules are unreviewed (drift), nudge to re-run.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { RULES, PROJECT_RULES } from '../rules/index.mjs';
import { loadCustomRules } from '../lib/custom-rules.mjs';

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
  const h = createHash('sha256').update(cwd).digest('hex');
  return join(tmpdir(), `praxis-guard-offered-${h}`);
}

function driftMarkerPath(cwd) {
  const h = createHash('sha256').update('drift:' + cwd).digest('hex');
  return join(tmpdir(), `praxis-guard-drift-${h}`);
}

(async () => {
try {
  const cwd = process.cwd();
  if (isNextProject(cwd)) {
    const configPath = join(cwd, '.praxis-guard', 'config.json');
    if (!existsSync(configPath)) {
      const marker = markerPath(cwd);
      if (!existsSync(marker)) {
        writeFileSync(marker, cwd);
        process.stdout.write(
          'praxis-guard: este proyecto Next.js no tiene config propia. ' +
          'Para elegir qué reglas corren, invocá la skill `praxis-config`.\n'
        );
      }
    } else {
      // Drift solo aplica si meta tiene reviewed_rules (config hecha con la praxis-config
      // que estampa el snapshot). Una config legacy sin ese campo no molesta.
      let reviewed = null;
      try {
        const m = JSON.parse(readFileSync(join(cwd, '.praxis-guard', 'meta.json'), 'utf8'));
        if (Array.isArray(m.reviewed_rules)) reviewed = m.reviewed_rules;
      } catch { reviewed = null; }
      const custom = await loadCustomRules(cwd);
      const registered = [...Object.keys(RULES), ...Object.keys(PROJECT_RULES), ...Object.keys(custom.fileRules), ...Object.keys(custom.projectRules)];
      const unreviewed = reviewed === null ? [] : registered.filter((id) => !reviewed.includes(id));
      if (unreviewed.length > 0) {
        const marker = driftMarkerPath(cwd);
        if (!existsSync(marker)) {
          writeFileSync(marker, cwd);
          process.stdout.write(
            `praxis-guard: hay ${unreviewed.length} regla(s) sin revisar (${unreviewed.join(', ')}). ` +
            'Corré la skill `praxis-config` para decidir sobre ellas.\n'
          );
        }
      }
    }
  }
} catch { /* never block the session */ }
process.exit(0);
})();
