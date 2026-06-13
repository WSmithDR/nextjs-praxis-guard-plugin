import { loadConfig } from '../../lib/config.mjs';
import assert from 'node:assert/strict';

const def = loadConfig({ projectConfigPath: '/no/such/file.json' });
assert.equal(def.rules['file-responsibility'].maxLines, 400);
assert.equal(def.rules.secrets.enabled, true);
assert.deepEqual(def.rules['forbidden-imports'].list, []);

const merged = loadConfig({
  projectConfigPath: '/no/such/file.json',
  override: { rules: { 'file-responsibility': { maxLines: 250 } } },
});
assert.equal(merged.rules['file-responsibility'].maxLines, 250);
assert.equal(merged.rules['file-responsibility'].mixedSignalsLines, 200, 'untouched key kept');
assert.equal(merged.rules.secrets.enabled, true, 'other rules kept');
console.log('config.test ok');
