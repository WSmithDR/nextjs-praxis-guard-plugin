import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCustomRules, readCustomRuleSources } from '../../lib/custom-rules.mjs';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'praxis-custom-'));
const rdir = join(dir, '.praxis-guard', 'rules');
try {
  mkdirSync(rdir, { recursive: true });
  // file rule
  writeFileSync(join(rdir, 'no-foo.mjs'), 'export default function(c){ return c.includes("FOO") ? [{rule:"no-foo",severity:"warn",message:"foo"}] : []; }');
  // project rule
  writeFileSync(join(rdir, 'proj-x.mjs'), 'export default function(tree){ return [{rule:"proj-x",severity:"info",message:"p"}]; }\nexport const meta = { kind: "project" };');
  // roto
  writeFileSync(join(rdir, 'broken.mjs'), 'export default function( { syntax error');
  // colisión con built-in
  writeFileSync(join(rdir, 'secrets.mjs'), 'export default function(){ return []; }');

  const r = await loadCustomRules(dir);
  assert.equal(typeof r.fileRules['no-foo'], 'function');
  assert.equal(typeof r.projectRules['proj-x'], 'function');
  assert.ok(!('secrets' in r.fileRules), 'no pisa built-in');
  const errIds = r.errors.map((e) => e.id).sort();
  assert.deepEqual(errIds, ['broken', 'secrets']);

  // sources
  const src = readCustomRuleSources(dir);
  assert.ok(src['no-foo'].includes('FOO'));
  assert.ok(!('secrets' in src), 'sources excluye colisiones');

  // sin dir rules -> vacío
  const empty = await loadCustomRules(mkdtempSync(join(tmpdir(), 'praxis-nocustom-')));
  assert.deepEqual(empty, { fileRules: {}, projectRules: {}, astRules: {}, errors: [] });
  console.log('custom-rules.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
