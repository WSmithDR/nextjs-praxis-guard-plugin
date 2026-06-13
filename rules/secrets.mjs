// rules/secrets.mjs
// Deterministic secret detector. Warn-only. Conservative to limit false positives.
const PROVIDER_PATTERNS = [
  { re: /\bsk_live_[A-Za-z0-9]{16,}/, label: 'Stripe live secret key' },
  { re: /\bsk-[A-Za-z0-9]{20,}/, label: 'OpenAI-style secret key' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS access key id' },
  { re: /\bghp_[A-Za-z0-9]{36}\b/, label: 'GitHub personal access token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{22,}/, label: 'GitHub fine-grained PAT' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, label: 'Slack token' },
  { re: /\bAIza[0-9A-Za-z_\-]{35}\b/, label: 'Google API key' },
  { re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s:'"]+:[^\s@'"]+@/, label: 'connection string with inline credentials' },
];

const GENERIC = /(?:api[_-]?key|secret|token|password|passwd|access[_-]?key)\s*[:=]\s*['"`]([^'"`]{16,})['"`]/i;
const PLACEHOLDER = /(your[-_ ]?|example|placeholder|changeme|xxx+|<[^>]+>|dummy|test[-_ ]?key)/i;

export default function secrets(content, _filePath, config = {}) {
  if (config.enabled === false) return [];
  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/process\.env\./.test(line)) continue;
    for (const { re, label } of PROVIDER_PATTERNS) {
      if (re.test(line)) {
        out.push({ rule: 'secrets', line: i + 1, severity: 'warn',
          message: `Posible ${label} hardcodeado. Movelo a una env var (process.env.X) y a .env.local.` });
        break;
      }
    }
    if (out.length && out[out.length - 1].line === i + 1) continue;
    const g = GENERIC.exec(line);
    if (g && !PLACEHOLDER.test(g[1])) {
      out.push({ rule: 'secrets', line: i + 1, severity: 'warn',
        message: `Literal sensible asignado en código. Si es un secreto, usá process.env.X en vez de hardcodearlo.` });
    }
  }
  return out;
}
