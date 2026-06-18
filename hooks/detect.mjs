// hooks/detect.mjs
import { readFileSync } from 'node:fs';
import { RULES } from '../rules/index.mjs';
import { loadConfig, defaultProjectConfigPath } from '../lib/config.mjs';
import { isInScope } from '../lib/scope.mjs';
import { formatFindings } from '../lib/findings.mjs';
import { detectStack } from '../lib/detect-stack.mjs';
import { loadCustomRules } from '../lib/custom-rules.mjs';
import { isGitIgnored } from '../lib/gitignore.mjs';

// runDetector(filePath, { content?, config?, customFileRules?, cwd?, skipGitignore? }) -> { findings, text }
export function runDetector(filePath, { content, config, customFileRules, cwd = process.cwd(), skipGitignore = false } = {}) {
  const cfg = config || loadConfig({ projectConfigPath: defaultProjectConfigPath() });
  if (!cfg.detected) {
    try { cfg.detected = detectStack(cwd); } catch { cfg.detected = { typescript: false, tailwind: false, tsconfigOptions: null, tsconfigFixable: false }; }
  }
  if (!isInScope(filePath, cfg)) return { findings: [], text: '' };
  if (cfg.respectGitignore && !skipGitignore && isGitIgnored(cwd, filePath)) return { findings: [], text: '' };

  let src = content;
  if (src == null) {
    try { src = readFileSync(filePath, 'utf8'); }
    catch { return { findings: [], text: '' }; }
  }

  const findings = [];
  const allFileRules = { ...(customFileRules || {}), ...RULES };  // built-in gana en colisión
  for (const [id, fn] of Object.entries(allFileRules)) {
    const ruleCfg = (cfg.rules && cfg.rules[id]) || {};
    if (ruleCfg.enabled === false) continue;
    try {
      const res = fn(src, filePath, ruleCfg, cfg);
      if (Array.isArray(res)) findings.push(...res);
    } catch { /* a broken rule never breaks detection */ }
  }
  return { findings, text: formatFindings(findings, filePath) };
}

// CLI entry: `node hooks/detect.mjs <file>` -> prints warnings (exit 0 always).
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  (async () => {
    const file = process.argv[2];
    if (file) {
      try {
        const custom = await loadCustomRules(process.cwd());
        const { text } = runDetector(file, { customFileRules: custom.fileRules });
        if (text) process.stdout.write(text + '\n');
      } catch { /* never fail the caller */ }
    }
    process.exit(0);
  })();
}
