// hooks/detect.mjs
import { readFileSync } from 'node:fs';
import { RULES } from '../rules/index.mjs';
import { loadConfig, defaultProjectConfigPath } from '../lib/config.mjs';
import { isInScope } from '../lib/scope.mjs';
import { formatFindings } from '../lib/findings.mjs';

// runDetector(filePath, { content?, config? }) -> { findings, text }
export function runDetector(filePath, { content, config } = {}) {
  const cfg = config || loadConfig({ projectConfigPath: defaultProjectConfigPath() });
  if (!isInScope(filePath, cfg)) return { findings: [], text: '' };

  let src = content;
  if (src == null) {
    try { src = readFileSync(filePath, 'utf8'); }
    catch { return { findings: [], text: '' }; }
  }

  const findings = [];
  for (const [id, fn] of Object.entries(RULES)) {
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
  const file = process.argv[2];
  if (file) {
    try {
      const { text } = runDetector(file);
      if (text) process.stdout.write(text + '\n');
    } catch { /* never fail the caller */ }
  }
  process.exit(0);
}
