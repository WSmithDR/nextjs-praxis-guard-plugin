// lib/fingerprint.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { RULES, PROJECT_RULES } from '../rules/index.mjs';

const RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules');

export function rulesFingerprint(config = {}) {
  const h = createHash('sha256');
  const ids = [...Object.keys(RULES), ...Object.keys(PROJECT_RULES)].sort();
  for (const id of ids) {
    const rc = (config.rules && config.rules[id]) || {};
    const enabled = rc.enabled !== false;
    h.update(`\n#${id}:${enabled}\n`);
    h.update(JSON.stringify(rc));
    try { h.update(readFileSync(join(RULES_DIR, `${id}.mjs`), 'utf8')); } catch { /* regla sin archivo */ }
  }
  h.update('\n@architecture\n');
  h.update(JSON.stringify(config.architecture || null));
  return 'sha256:' + h.digest('hex');
}
