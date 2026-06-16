# Reglas custom por proyecto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar reglas custom desde `.praxis-guard/rules/*.mjs` y correrlas en el hook (en vivo) y en la auditoría, con el mismo contrato que las built-in.

**Architecture:** `lib/custom-rules.mjs` hace `import()` dinámico de cada `.mjs` (async). El motor `runDetector` queda síncrono y recibe las file rules custom ya cargadas; el async se aísla en los entry points (hook-adapter, detect CLI, praxis-audit, praxis-config — todos ya async o convertibles). Integra config (extraKnownRules), fingerprint (hashea las custom) y drift.

**Tech Stack:** Node ≥18, ESM `.mjs`, zero-dep. Tests = scripts `.mjs` con `node:assert/strict`, corridos por `test/run.mjs`. Correr todo: `npm test`. Correr uno: `node test/ruta.test.mjs`.

**Spec:** `docs/specs/2026-06-15-custom-rules-design.md`

**Anchors verificados:**
- `hooks/detect.mjs`: `runDetector(filePath, { content, config } = {})`; loop `for (const [id, fn] of Object.entries(RULES))` (línea ~24); CLI entry `if (isMain) { ... runDetector(file) ... }` (líneas ~36-46, sync).
- `hooks/hook-adapter.mjs`: IIFE async ya existente; llama `runDetector(filePath)` (línea ~47).
- `bin/praxis-audit.mjs`: `runFileRules(relPaths)` llama `runDetector(abs, { config })`; `runProjectRules()` itera `PROJECT_RULES`; `config.detected = detectStack(dir)` cerca del top, seguido del bloque `--fix-tsconfig` y `--update-baseline`.
- `bin/praxis-config.mjs`: en `write`, `const { ok, errors } = validateConfig(obj)`, luego `writeMeta(dir, { ..., reviewed_rules: [...Object.keys(RULES), ...Object.keys(PROJECT_RULES)].sort(), rules_fingerprint: rulesFingerprint(merged) })`.
- `lib/validate-config.mjs`: `KNOWN_RULES` array; loop `if (!KNOWN_RULES.includes(id)) { errors.push('regla desconocida...'); continue; }`.
- `lib/fingerprint.mjs`: `rulesFingerprint(config = {})` hashea built-ins + architecture.
- `hooks/praxis-session-offer.mjs`: drift compara `registered = [...Object.keys(RULES), ...Object.keys(PROJECT_RULES)]` vs `reviewed`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/custom-rules.mjs` (new) | `loadCustomRules(dir)` async, `readCustomRuleSources(dir)` |
| `hooks/detect.mjs` (mod) | `runDetector` acepta `customFileRules`; CLI entry async |
| `hooks/hook-adapter.mjs` (mod) | carga custom, la pasa a `runDetector` |
| `bin/praxis-audit.mjs` (mod) | carga custom (file+project), runners + errores + fingerprint |
| `lib/validate-config.mjs` (mod) | 2º arg `extraKnownRules` |
| `bin/praxis-config.mjs` (mod) | extraKnownRules + fingerprint con custom + reviewed_rules |
| `lib/fingerprint.mjs` (mod) | `rulesFingerprint(config, customRuleSources)` |
| `hooks/praxis-session-offer.mjs` (mod) | drift incluye ids custom |
| docs | skills + README + AGENTS |

---

## Task 1: `lib/custom-rules.mjs`

**Files:**
- Create: `lib/custom-rules.mjs`
- Test: `test/lib/custom-rules.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/lib/custom-rules.test.mjs`:

```js
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
  assert.deepEqual(empty, { fileRules: {}, projectRules: {}, errors: [] });
  console.log('custom-rules.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/custom-rules.test.mjs`

- [ ] **Step 3: Implementar `lib/custom-rules.mjs`**

```js
// lib/custom-rules.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RULES, PROJECT_RULES } from '../rules/index.mjs';

const BUILTIN_IDS = new Set([...Object.keys(RULES), ...Object.keys(PROJECT_RULES)]);

export function customRulesDir(dir) { return join(dir, '.praxis-guard', 'rules'); }

// Carga las reglas custom de .praxis-guard/rules/*.mjs. Nunca lanza.
export async function loadCustomRules(dir) {
  const out = { fileRules: {}, projectRules: {}, errors: [] };
  let entries;
  try { entries = readdirSync(customRulesDir(dir)); }
  catch { return out; }
  for (const name of entries) {
    if (!name.endsWith('.mjs')) continue;
    const id = name.slice(0, -4);
    if (BUILTIN_IDS.has(id)) { out.errors.push({ id, error: 'colisión con regla built-in' }); continue; }
    let mod;
    try { mod = await import(pathToFileURL(join(customRulesDir(dir), name)).href); }
    catch (e) { out.errors.push({ id, error: String((e && e.message) || e) }); continue; }
    if (typeof mod.default !== 'function') { out.errors.push({ id, error: 'sin default export función' }); continue; }
    const kind = (mod.meta && mod.meta.kind) === 'project' ? 'project' : 'file';
    if (kind === 'project') out.projectRules[id] = mod.default;
    else out.fileRules[id] = mod.default;
  }
  return out;
}

// Código fuente de cada regla custom (para el fingerprint). No lanza.
export function readCustomRuleSources(dir) {
  const sources = {};
  let entries;
  try { entries = readdirSync(customRulesDir(dir)); }
  catch { return sources; }
  for (const name of entries) {
    if (!name.endsWith('.mjs')) continue;
    const id = name.slice(0, -4);
    if (BUILTIN_IDS.has(id)) continue;
    try { sources[id] = readFileSync(join(customRulesDir(dir), name), 'utf8'); } catch { /* skip */ }
  }
  return sources;
}
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/lib/custom-rules.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add lib/custom-rules.mjs test/lib/custom-rules.test.mjs
git commit -m "feat(lib): custom-rules loader (.praxis-guard/rules/*.mjs)"
```

---

## Task 2: `runDetector` acepta `customFileRules` + entry points del hook

**Files:**
- Modify: `hooks/detect.mjs`
- Modify: `hooks/hook-adapter.mjs`
- Test: `test/detect-custom.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/detect-custom.test.mjs`:

```js
import { runDetector } from '../hooks/detect.mjs';
import assert from 'node:assert/strict';

const myRule = (content) => content.includes('FOO')
  ? [{ rule: 'no-foo', line: 1, severity: 'warn', message: 'foo' }] : [];
const cfg = { include: ['.ts'], exclude: [], detected: { typescript: false, tailwind: false }, rules: {} };

// corre la custom
let r = runDetector('a.ts', { content: 'const FOO = 1;', config: cfg, customFileRules: { 'no-foo': myRule } });
assert.equal(r.findings.length, 1);
assert.equal(r.findings[0].rule, 'no-foo');

// respeta enabled:false
const cfgOff = { ...cfg, rules: { 'no-foo': { enabled: false } } };
r = runDetector('a.ts', { content: 'const FOO = 1;', config: cfgOff, customFileRules: { 'no-foo': myRule } });
assert.equal(r.findings.length, 0);

// built-in gana si el id choca (un fake 'secrets' custom NO corre sobre contenido sin secreto)
const fakeSecrets = () => [{ rule: 'secrets', severity: 'warn', message: 'FAKE' }];
r = runDetector('a.ts', { content: 'const x = 1;', config: cfg, customFileRules: { 'secrets': fakeSecrets } });
assert.ok(!r.findings.some((f) => f.message === 'FAKE'), 'built-in pisa la custom homónima');
console.log('detect-custom.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/detect-custom.test.mjs`

- [ ] **Step 3: Modificar `hooks/detect.mjs`**

(a) Cambiar la firma y el loop. Reemplazar:
```js
export function runDetector(filePath, { content, config } = {}) {
```
por:
```js
export function runDetector(filePath, { content, config, customFileRules } = {}) {
```

Reemplazar el loop:
```js
  const findings = [];
  for (const [id, fn] of Object.entries(RULES)) {
```
por:
```js
  const findings = [];
  const allFileRules = { ...(customFileRules || {}), ...RULES };  // built-in gana en colisión
  for (const [id, fn] of Object.entries(allFileRules)) {
```

(b) Convertir el CLI entry a async cargando las custom. Agregar import arriba:
```js
import { loadCustomRules } from '../lib/custom-rules.mjs';
```
Reemplazar el bloque `if (isMain) { ... }` por:
```js
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
```

- [ ] **Step 4: Modificar `hooks/hook-adapter.mjs`**

Agregar import arriba (junto a `import { runDetector } from './detect.mjs';`):
```js
import { loadCustomRules } from '../lib/custom-rules.mjs';
```
Dentro del IIFE async, reemplazar:
```js
    const { text } = runDetector(filePath);
```
por:
```js
    const custom = await loadCustomRules(process.cwd());
    const { text } = runDetector(filePath, { customFileRules: custom.fileRules });
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/detect-custom.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add hooks/detect.mjs hooks/hook-adapter.mjs test/detect-custom.test.mjs
git commit -m "feat(hook): runDetector corre custom file rules; entry points cargan custom"
```

---

## Task 3: `praxis-audit` carga y corre las custom (file + project) + errores

**Files:**
- Modify: `bin/praxis-audit.mjs`
- Test: `test/bin/praxis-audit-custom.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/bin/praxis-audit-custom.test.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-audit-custom-'));
try {
  mkdirSync(join(dir, '.praxis-guard', 'rules'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), '{}');
  // file rule custom
  writeFileSync(join(dir, '.praxis-guard', 'rules', 'no-foo.mjs'),
    'export default function(c, p){ return c.includes("FOO") ? [{rule:"no-foo",line:1,severity:"warn",message:"foo prohibido"}] : []; }');
  // regla rota
  writeFileSync(join(dir, '.praxis-guard', 'rules', 'broken.mjs'), 'export default function( { nope');
  writeFileSync(join(dir, 'src', 'a.ts'), 'const FOO = 1;');

  const r = spawnSync('node', [AUDIT, '--full', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no-foo|foo prohibido/, 'corre la regla custom');
  assert.match(r.stdout, /broken.*no cargó|no cargó.*broken/, 'reporta el error de carga');
  console.log('praxis-audit-custom.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

- [ ] **Step 2: Correr → falla.** Run: `node test/bin/praxis-audit-custom.test.mjs`

- [ ] **Step 3: Modificar `bin/praxis-audit.mjs`** (read it first)

(a) Agregar import junto a los otros `../lib/*`:
```js
import { loadCustomRules } from '../lib/custom-rules.mjs';
```

(b) Inmediatamente DESPUÉS de la línea `try { config.detected = detectStack(dir); } catch { ... }` y ANTES del bloque `if (process.argv.includes('--fix-tsconfig'))`, agregar (top-level await: el módulo `.mjs` lo permite):
```js
const custom = await loadCustomRules(dir);
for (const e of custom.errors) console.log(`⚠ regla custom "${e.id}" no cargó: ${e.error}`);
```

(c) En `runFileRules`, pasar las custom file rules a `runDetector`. Reemplazar:
```js
    try { res = runDetector(abs, { config }); } catch { continue; }
```
por:
```js
    try { res = runDetector(abs, { config, customFileRules: custom.fileRules }); } catch { continue; }
```

(d) En `runProjectRules`, iterar también las project rules custom. Reemplazar:
```js
  for (const [id, fn] of Object.entries(PROJECT_RULES)) {
```
por:
```js
  for (const [id, fn] of Object.entries({ ...custom.projectRules, ...PROJECT_RULES })) {
```

> `custom` es `const` con top-level await asignado antes de cualquier llamada a `runFileRules`/`runProjectRules` (que ocurren en los bloques de modo y en los early-exits posteriores). Las funciones son hoisted; la referencia a `custom` se resuelve en tiempo de llamada, ya asignada.

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/bin/praxis-audit-custom.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add bin/praxis-audit.mjs test/bin/praxis-audit-custom.test.mjs
git commit -m "feat(audit): corre reglas custom (file + project) y reporta errores de carga"
```

---

## Task 4: `validate-config` `extraKnownRules` + `praxis-config` los pasa

**Files:**
- Modify: `lib/validate-config.mjs`
- Modify: `bin/praxis-config.mjs`
- Test: `test/lib/validate-config.test.mjs` (append)

- [ ] **Step 1: Añadir caso al test (falla)**

Append a `test/lib/validate-config.test.mjs`, antes del `console.log('validate-config.test ok')` final:

```js
// --- extraKnownRules (reglas custom) ---
assert.equal(validateConfig({ rules: { 'mi-regla': { enabled: false } } }).ok, false);
assert.equal(validateConfig({ rules: { 'mi-regla': { enabled: false } } }, ['mi-regla']).ok, true);
console.log('validate-config extraKnownRules ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/validate-config.test.mjs`

- [ ] **Step 3: Modificar `lib/validate-config.mjs`**

Cambiar la firma:
```js
export function validateConfig(obj) {
```
por:
```js
export function validateConfig(obj, extraKnownRules = []) {
```

Reemplazar la verificación de regla desconocida:
```js
        if (!KNOWN_RULES.includes(id)) {
          errors.push(`regla desconocida: "${id}" (válidas: ${KNOWN_RULES.join(', ')})`);
          continue;
        }
```
por:
```js
        if (!KNOWN_RULES.includes(id) && !extraKnownRules.includes(id)) {
          errors.push(`regla desconocida: "${id}" (válidas: ${KNOWN_RULES.join(', ')}${extraKnownRules.length ? ', ' + extraKnownRules.join(', ') : ''})`);
          continue;
        }
```

- [ ] **Step 4: Modificar `bin/praxis-config.mjs`**

Agregar import:
```js
import { loadCustomRules } from '../lib/custom-rules.mjs';
```
En el bloque `if (cmd === 'write')`, después de parsear `obj` y ANTES de `const { ok, errors } = validateConfig(obj);`, agregar:
```js
  const custom = await loadCustomRules(dir);
  const customIds = [...Object.keys(custom.fileRules), ...Object.keys(custom.projectRules)];
```
y cambiar:
```js
  const { ok, errors } = validateConfig(obj);
```
por:
```js
  const { ok, errors } = validateConfig(obj, customIds);
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/lib/validate-config.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add lib/validate-config.mjs bin/praxis-config.mjs test/lib/validate-config.test.mjs
git commit -m "feat(config): validate-config acepta extraKnownRules; praxis-config carga custom"
```

---

## Task 5: `fingerprint` hashea las custom (drift al editarlas)

**Files:**
- Modify: `lib/fingerprint.mjs`
- Modify: `bin/praxis-audit.mjs`
- Modify: `bin/praxis-config.mjs`
- Test: `test/lib/fingerprint.test.mjs` (append)

- [ ] **Step 1: Añadir caso al test (falla)**

Append a `test/lib/fingerprint.test.mjs`, antes del `console.log('fingerprint.test ok')` final:

```js
// --- custom rule sources ---
{
  const base = { rules: {} };
  const a = rulesFingerprint(base, {});
  const withCustom = rulesFingerprint(base, { 'no-foo': 'export default () => []' });
  assert.notEqual(a, withCustom, 'una custom cambia el fingerprint');
  const sameCustom = rulesFingerprint(base, { 'no-foo': 'export default () => []' });
  assert.equal(withCustom, sameCustom, 'mismo source -> mismo fingerprint');
  const edited = rulesFingerprint(base, { 'no-foo': 'export default () => [1]' });
  assert.notEqual(withCustom, edited, 'editar la custom cambia el fingerprint');
}
console.log('fingerprint custom sources ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/fingerprint.test.mjs`

- [ ] **Step 3: Modificar `lib/fingerprint.mjs`**

Cambiar la firma:
```js
export function rulesFingerprint(config = {}) {
```
por:
```js
export function rulesFingerprint(config = {}, customRuleSources = {}) {
```

Antes del `return 'sha256:' + h.digest('hex');` final, agregar:
```js
  for (const id of Object.keys(customRuleSources).sort()) {
    h.update(`\n@custom#${id}\n`);
    h.update(String(customRuleSources[id]));
  }
```

- [ ] **Step 4: Modificar `bin/praxis-audit.mjs`**

Agregar import:
```js
import { readCustomRuleSources } from '../lib/custom-rules.mjs';
```
(ajustá la línea de import existente de `custom-rules.mjs` para traer ambos: `import { loadCustomRules, readCustomRuleSources } from '../lib/custom-rules.mjs';`)

Cambiar la línea que computa el fingerprint:
```js
const fp = rulesFingerprint(config);
```
por:
```js
const fp = rulesFingerprint(config, readCustomRuleSources(dir));
```

- [ ] **Step 5: Modificar `bin/praxis-config.mjs`**

Agregar `readCustomRuleSources` al import de `custom-rules.mjs`:
```js
import { loadCustomRules, readCustomRuleSources } from '../lib/custom-rules.mjs';
```
Cambiar:
```js
    rules_fingerprint: rulesFingerprint(merged),
```
por:
```js
    rules_fingerprint: rulesFingerprint(merged, readCustomRuleSources(dir)),
```

- [ ] **Step 6: Correr → PASS** + suite. Run: `node test/lib/fingerprint.test.mjs` y `npm test`

- [ ] **Step 7: Commit**

```bash
git add lib/fingerprint.mjs bin/praxis-audit.mjs bin/praxis-config.mjs test/lib/fingerprint.test.mjs
git commit -m "feat(fingerprint): hashear reglas custom (editar una dispara full audit)"
```

---

## Task 6: Drift en SessionStart incluye ids custom

**Files:**
- Modify: `bin/praxis-config.mjs` (reviewed_rules incluye custom)
- Modify: `hooks/praxis-session-offer.mjs`
- Test: `test/hooks/session-offer-custom.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/hooks/session-offer-custom.test.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'praxis-session-offer.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-custom-drift-'));
try {
  writeFileSync(join(dir, 'next.config.js'), 'module.exports = {};');
  mkdirSync(join(dir, '.praxis-guard', 'rules'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), '{}');
  // meta revisó todas las built-in pero NO la custom nueva
  writeFileSync(join(dir, '.praxis-guard', 'rules', 'mi-regla.mjs'), 'export default function(){ return []; }');
  // reviewed_rules: simulamos que ya revisó todas las built-in (lista grande) salvo la custom
  // Para forzar el drift por la custom, reviewed contiene solo built-ins (no 'mi-regla').
  writeFileSync(join(dir, '.praxis-guard', 'meta.json'), JSON.stringify({
    reviewed_rules: ['secrets','hardcoded-data','forbidden-imports','file-responsibility','untranslated-text','folder-placement','architecture-coherence','layer-boundaries','server-client-boundaries','feature-deps','repeated-object-shape','stringly-typed','duplicate-literal-union','prefer-as-const','tsconfig-strictness','tailwind-arbitrary-values','tailwind-classname-bloat','tailwind-conditional-concat','tailwind-duplicate-utilities'],
  }));

  const r = spawnSync('node', [HOOK], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: dir, TMPDIR: dir } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /mi-regla|sin revisar/i, 'avisa de la regla custom no revisada');
  console.log('session-offer-custom.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

> Nota: si el set de built-ins cambió desde la escritura de este plan, el test podría disparar también por una built-in no listada; el assert busca `mi-regla` o el aviso genérico, así que sigue siendo válido. Si fuera frágil, el implementador puede regenerar la lista `reviewed_rules` con `Object.keys` de RULES+PROJECT_RULES en un pequeño script previo.

- [ ] **Step 2: Correr → falla.** Run: `node test/hooks/session-offer-custom.test.mjs`

- [ ] **Step 3: Modificar `bin/praxis-config.mjs`** — incluir ids custom en `reviewed_rules`

Cambiar:
```js
    reviewed_rules: [...Object.keys(RULES), ...Object.keys(PROJECT_RULES)].sort(),
```
por:
```js
    reviewed_rules: [...Object.keys(RULES), ...Object.keys(PROJECT_RULES), ...customIds].sort(),
```
(`customIds` ya existe desde Task 4.)

- [ ] **Step 4: Modificar `hooks/praxis-session-offer.mjs`** (read it first)

Agregar import arriba:
```js
import { loadCustomRules } from '../lib/custom-rules.mjs';
```
La rama de drift compara `registered` vs `reviewed`. Convertir el bloque a async para poder cargar las custom: envolver el cuerpo del `try` en una IIFE async, y donde se calcula `registered`, sumar las custom. Concretamente, reemplazar:
```js
      const registered = [...Object.keys(RULES), ...Object.keys(PROJECT_RULES)];
```
por:
```js
      const custom = await loadCustomRules(cwd);
      const registered = [...Object.keys(RULES), ...Object.keys(PROJECT_RULES), ...Object.keys(custom.fileRules), ...Object.keys(custom.projectRules)];
```
Y asegurar que el `try { ... } catch { } process.exit(0)` final corra dentro de una IIFE async (envolver: `(async () => { try { ... } catch {} process.exit(0); })();`). Si el archivo ya no tiene `process.exit(0)` fuera del try, mantené el `process.exit(0)` al final de la IIFE.

> Si la estructura actual ya usa `await` en otro lado, basta con que el bloque que llama `loadCustomRules` esté dentro de un contexto async. Verificá leyendo el archivo y adaptá mínimamente.

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/hooks/session-offer-custom.test.mjs`, `node test/hooks/session-offer.test.mjs`, `node test/hooks/session-offer-drift.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add bin/praxis-config.mjs hooks/praxis-session-offer.mjs test/hooks/session-offer-custom.test.mjs
git commit -m "feat(drift): reglas custom nuevas disparan la oferta de praxis-config"
```

---

## Task 7: Documentación

**Files:**
- Modify: `skills/praxis-config/SKILL.md`
- Modify: `skills/praxis-audit/SKILL.md`
- Modify: `AGENTS.md` (CLAUDE.md symlink → editar AGENTS.md)
- Modify: `README.md`

- [ ] **Step 1: `README.md`** — agregar una sección nueva (después de la sección de reglas, antes de "## Cómo funciona"):

```markdown
## Reglas custom por proyecto

Cada proyecto puede definir reglas propias en `.praxis-guard/rules/<id>.mjs` (committeables). El
nombre del archivo es el `id`. Mismo contrato que las built-in:

```js
// .praxis-guard/rules/no-console.mjs
export default function (content, filePath, config = {}, full = {}) {
  const out = [];
  content.split('\n').forEach((line, i) => {
    if (/\bconsole\.(log|debug)\(/.test(line))
      out.push({ rule: 'no-console', line: i + 1, severity: 'warn', message: 'console.* en producción.' });
  });
  return out;
}
export const meta = { kind: 'project' }; // opcional: 'file' (default) o 'project'
```

- **file rule** (default): `(content, filePath, ruleConfig, fullConfig) => Finding[]` — corre en el
  hook (en vivo) y en la auditoría.
- **project rule** (`meta.kind: 'project'`): `(projectTree, fullConfig) => Finding[]` — corre solo
  en la auditoría.
- Está activa por existir el archivo; se apaga/parametriza con `config.rules[<id>]`.
- Un id que choca con una regla built-in se ignora (gana el built-in). Un archivo roto se saltea
  con un aviso en la auditoría; nunca rompe el hook.
- Editar una regla custom dispara una auditoría completa (entra en el fingerprint).
```

- [ ] **Step 2: `AGENTS.md`** — agregar un párrafo al final de la sección de reglas:

```markdown
Reglas custom por proyecto: archivos `.praxis-guard/rules/<id>.mjs` (default export = la función
regla, `export const meta = { kind: 'file'|'project' }` opcional). Corren en el hook (file) y en la
auditoría (file+project), con el mismo contrato que las built-in. Se configuran por `config.rules[<id>]`.
```

- [ ] **Step 3: `skills/praxis-config/SKILL.md`** — en la sección de reglas, agregar:

```markdown
   - **Reglas custom** (`.praxis-guard/rules/<id>.mjs`): si el proyecto tiene reglas propias, sus
     ids también se pueden activar/parametrizar en `config.rules[<id>]`. El CLI las reconoce
     (no las marca como desconocidas).
```

- [ ] **Step 4: `skills/praxis-audit/SKILL.md`** — agregar bajo "Reglas":

```markdown
- Las reglas custom de `.praxis-guard/rules/*.mjs` corren en la auditoría (file + project). Si una
  no carga (syntax error / colisión con built-in), se reporta `⚠ regla custom "x" no cargó` sin abortar.
```

- [ ] **Step 5: Verificar y commit**

Run: `npm test` (Expected: todos los test files pasan)

```bash
git add skills/praxis-config/SKILL.md skills/praxis-audit/SKILL.md AGENTS.md README.md
git commit -m "docs: reglas custom por proyecto"
```

---

## Self-review (cobertura del spec)

- **A.1 contrato + ubicación** → Task 1 (loader) + Task 7 (docs con ejemplo).
- **A.2 loadCustomRules (file/project/errors/colisión/sin-dir)** → Task 1.
- **A.3 activación por existencia + config** → Task 2/3 (corren con gating de `config.rules[id]`).
- **B.1 runDetector sync + entry points async (hook-adapter, detect CLI)** → Task 2.
- **B.2 auditoría corre custom (file+project) + errores** → Task 3.
- **B.3 config extraKnownRules + praxis-config** → Task 4.
- **B.4 fingerprint con custom; drift reviewed_rules + session-offer** → Task 5 (fingerprint) + Task 6 (reviewed_rules + session-offer).
- **B.5 errores (hook silencioso / audit informa)** → Task 2 (hook try/catch) + Task 3 (audit reporta).
- **C/D/E** → cubiertos; `readCustomRuleSources` (helper para fingerprint) es una sub-pieza de Task 1, usada en Task 5.

Consistencia de nombres: `loadCustomRules` → `{ fileRules, projectRules, errors }`; `readCustomRuleSources` → `{ id: source }`; `runDetector(..., { customFileRules })`; `validateConfig(obj, extraKnownRules)`; `rulesFingerprint(config, customRuleSources)`; `customIds` en praxis-config.
