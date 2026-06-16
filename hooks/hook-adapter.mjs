// hooks/hook-adapter.mjs
// Shared bridge for command-type post-edit hooks (Claude / Gemini / Codex / Copilot).
// Reads CLI JSON on stdin, runs the detector, emits the CLI's additionalContext envelope.
// ALWAYS exits 0. Never throws to the caller.
import { runDetector } from './detect.mjs';
import { loadCustomRules } from '../lib/custom-rules.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
    if (process.stdin.isTTY) resolve('');
  });
}

function getCli() {
  const arg = process.argv.find((a) => a.startsWith('--cli='));
  return arg ? arg.split('=')[1] : 'claude';
}

function extractPath(evt) {
  const ti = evt.tool_input || evt.toolArgs || evt.tool_args || {};
  const direct = ti.file_path || ti.filePath || ti.path || ti.absolute_path;
  if (direct) return direct;
  const cmd = ti.command || evt.command;
  if (typeof cmd === 'string') {
    const m = cmd.match(/\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)/);
    if (m) return m[1].trim();
  }
  return null;
}

function envelope(cli, text) {
  if (cli === 'copilot') return JSON.stringify({ additionalContext: text });
  const hookEventName = cli === 'gemini' ? 'AfterTool' : 'PostToolUse';
  return JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: text } });
}

(async () => {
  try {
    const cli = getCli();
    const raw = await readStdin();
    const evt = raw ? JSON.parse(raw) : {};
    const filePath = extractPath(evt);
    if (!filePath) return;
    const custom = await loadCustomRules(process.cwd());
    const { text } = runDetector(filePath, { customFileRules: custom.fileRules });
    if (text) process.stdout.write(envelope(cli, text));
  } catch {
    /* swallow everything: warn-only, never break the edit */
  } finally {
    process.exit(0);
  }
})();
