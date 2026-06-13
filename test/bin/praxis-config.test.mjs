import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const CLI = new URL('../../bin/praxis-config.mjs', import.meta.url).pathname;
function run(args, input) {
  return execFileSync('node', [CLI, ...args], { input: input ?? '', encoding: 'utf8' });
}

const dir = mkdtempSync(join(tmpdir(), 'praxis-cli-'));
assert.equal(run(['show', '--dir', dir]).trim(), '{}');

run(['write', '--dir', dir], JSON.stringify({ rules: { 'file-responsibility': { maxLines: 250 } } }));
const cfg = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'config.json'), 'utf8'));
assert.equal(cfg.rules['file-responsibility'].maxLines, 250);
const meta = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'meta.json'), 'utf8'));
assert.ok(meta.configured_at && meta.plugin_version, 'meta stamped');
assert.equal(meta.schema_version, 1);

assert.ok(run(['show', '--dir', dir]).includes('250'));

let threw = false;
try { run(['write', '--dir', dir], JSON.stringify({ rules: { bogus: {} } })); }
catch (e) { threw = true; assert.equal(e.status, 1); }
assert.ok(threw, 'invalid config rejected with exit 1');
assert.ok(JSON.parse(readFileSync(join(dir, '.praxis-guard', 'config.json'), 'utf8')).rules['file-responsibility'], 'previous valid config preserved');

rmSync(dir, { recursive: true, force: true });
console.log('praxis-config-cli.test ok');
