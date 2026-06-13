import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const ADAPTER = new URL('../hooks/hook-adapter.mjs', import.meta.url).pathname;

function run(cli, payload) {
  return execFileSync('node', [ADAPTER, `--cli=${cli}`], {
    input: JSON.stringify(payload), encoding: 'utf8',
  }).trim();
}

const fixture = new URL('./fixtures/secrets/bad/keys.ts', import.meta.url).pathname;

const claudeOut = run('claude', { tool_name: 'Write', tool_input: { file_path: fixture } });
const claudeJson = JSON.parse(claudeOut);
assert.equal(claudeJson.hookSpecificOutput.hookEventName, 'PostToolUse');
assert.ok(claudeJson.hookSpecificOutput.additionalContext.includes('praxis-guard'));

const copilotOut = run('copilot', { toolName: 'edit', toolArgs: { path: fixture } });
assert.ok(JSON.parse(copilotOut).additionalContext.includes('praxis-guard'));

const geminiOut = run('gemini', { tool_name: 'write_file', tool_input: { absolute_path: fixture } });
assert.equal(JSON.parse(geminiOut).hookSpecificOutput.hookEventName, 'AfterTool');

const codexOut = run('codex', { tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n*** Update File: ${fixture}\n*** End Patch` } });
assert.ok(JSON.parse(codexOut).hookSpecificOutput.additionalContext.includes('praxis-guard'));

const clean = new URL('./fixtures/secrets/good/env.ts', import.meta.url).pathname;
assert.equal(run('claude', { tool_name: 'Write', tool_input: { file_path: clean } }), '');

assert.equal(run('claude', {}), '');
console.log('hook-adapter.test ok');
