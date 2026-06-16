# Salida SARIF + GitHub Action — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir los findings del audit en SARIF 2.1.0 (`praxis-audit --format sarif`) con un gate de exit code (`--gate`), y un workflow de GitHub Action instalable que los sube como anotaciones en el PR (code scanning).

**Architecture:** Un formateador puro `lib/sarif.mjs` traduce los findings (ya estructurados) a SARIF. El runner gana `--format sarif` (stdout = solo SARIF, diagnósticos a stderr) y `--gate` (exit 1 según `commit.minSeverity`, vía helper `lib/gate.mjs`). Un template `cli/github-action.yml` se instala con `install-hooks --cli github-action`, que inyecta la URL+ref del plugin (git clone fijado).

**Tech Stack:** Node ≥18 ESM, zero-dep, test runner casero (`node test/run.mjs`, assert/strict), SARIF 2.1.0.

**Spec:** `docs/specs/2026-06-16-sarif-github-action-design.md`

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/sarif.mjs` (crear) | `toSarif(findings, meta)` → objeto SARIF 2.1.0, puro y determinista. |
| `lib/gate.mjs` (crear) | `gateExitCode(findings, config)` → 0/1 según `commit.minSeverity`. |
| `bin/praxis-audit.mjs` (modificar) | flags `--format`/`--gate`; stdout limpio en sarif; reusa `gateExitCode`. |
| `cli/github-action.yml` (crear) | template del workflow con placeholders `__PLUGIN_URL__`/`__PLUGIN_REF__`. |
| `bin/install-hooks.mjs` (modificar) | case `github-action`: genera el `.yml` con url/ref inyectados. |
| `test/lib/sarif.test.mjs` (crear) | estructura + determinismo del formateador. |
| `test/lib/gate.test.mjs` (crear) | matriz de severidad/umbral del gate. |
| `test/bin/praxis-audit-sarif.test.mjs` (crear) | `--format sarif` + `--gate` end-to-end. |
| `test/bin/install-github-action.test.mjs` (crear) | generación del workflow. |
| `test/fixtures/sarif-project/` (crear) | fixture con un finding `stringly-typed` (info). |
| `README.md`, `AGENTS.md`, skill `praxis-audit` (modificar) | docs. |

---

## Task 1: Formateador SARIF — `lib/sarif.mjs`

**Files:**
- Create: `lib/sarif.mjs`
- Test: `test/lib/sarif.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lib/sarif.test.mjs`:

```js
import assert from 'node:assert/strict';
import { toSarif } from '../../lib/sarif.mjs';

const findings = [
  { rule: 'stringly-typed', file: 'src/b.ts', line: 3, severity: 'info', message: 'usá un union' },
  { rule: 'secrets', file: 'src/a.ts', line: 10, severity: 'error', message: 'key hardcodeada' },
  { rule: 'tsconfig-strictness', file: 'tsconfig.json', line: null, severity: 'warn', message: 'falta strict' },
];

const sarif = toSarif(findings, { toolName: 'nextjs-praxis-guard', toolVersion: '0.1.0' });

// estructura base
assert.equal(sarif.version, '2.1.0');
assert.ok(sarif.$schema);
assert.equal(sarif.runs.length, 1);
const run = sarif.runs[0];
assert.equal(run.tool.driver.name, 'nextjs-praxis-guard');
assert.equal(run.tool.driver.version, '0.1.0');

// rules deduplicadas (3 reglas distintas)
assert.equal(run.tool.driver.rules.length, 3);
assert.ok(run.tool.driver.rules.some((r) => r.id === 'secrets'));

// results: uno por finding, mapeo de level
assert.equal(run.results.length, 3);
const bySev = Object.fromEntries(run.results.map((r) => [r.ruleId, r.level]));
assert.equal(bySev['stringly-typed'], 'note');   // info -> note
assert.equal(bySev['tsconfig-strictness'], 'warning'); // warn -> warning
assert.equal(bySev['secrets'], 'error');          // error -> error

// location + region
const sec = run.results.find((r) => r.ruleId === 'secrets');
assert.equal(sec.locations[0].physicalLocation.artifactLocation.uri, 'src/a.ts');
assert.equal(sec.locations[0].physicalLocation.region.startLine, 10);
assert.ok(sec.partialFingerprints.praxisFingerprint.startsWith('sha256:'));
assert.equal(sec.message.text, 'key hardcodeada');

// finding sin línea -> sin region
const tsc = run.results.find((r) => r.ruleId === 'tsconfig-strictness');
assert.equal(tsc.locations[0].physicalLocation.region, undefined);

// determinismo: misma entrada (incluso desordenada) -> salida idéntica
const shuffled = [findings[2], findings[0], findings[1]];
assert.equal(JSON.stringify(toSarif(findings, { toolName: 'x', toolVersion: '1' })),
             JSON.stringify(toSarif(shuffled, { toolName: 'x', toolVersion: '1' })));

console.log('sarif.test ok');
```

- [ ] **Step 2: Correr para ver que falla**

Run: `node test/lib/sarif.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/sarif.mjs'`.

- [ ] **Step 3: Implementar el módulo**

Crear `lib/sarif.mjs`:

```js
// lib/sarif.mjs
// Traduce findings { rule, file, line, severity, message } a SARIF 2.1.0.
// Puro y determinista: orden estable, sin timestamps, paths relativos.
import { findingFingerprint } from './baseline.mjs';

const SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const LEVEL = { info: 'note', warn: 'warning', error: 'error' };

export function toSarif(findings, { toolName = 'nextjs-praxis-guard', toolVersion = '0.0.0', informationUri = 'https://github.com/WSmithDR/nextjs-praxis-guard-plugin' } = {}) {
  // orden estable: file, line, rule, message.
  const sorted = [...findings].sort((a, b) =>
    String(a.file).localeCompare(String(b.file))
    || ((a.line ?? 0) - (b.line ?? 0))
    || String(a.rule).localeCompare(String(b.rule))
    || String(a.message).localeCompare(String(b.message)));

  // reglas distintas (ordenadas) -> reportingDescriptors.
  const ruleIds = [...new Set(sorted.map((f) => f.rule))].sort();
  const rules = ruleIds.map((id) => ({ id, name: id }));

  const results = sorted.map((f) => {
    const physicalLocation = { artifactLocation: { uri: String(f.file) } };
    if (f.line != null) physicalLocation.region = { startLine: f.line };
    return {
      ruleId: f.rule,
      level: LEVEL[f.severity] || 'note',
      message: { text: String(f.message) },
      locations: [{ physicalLocation }],
      partialFingerprints: { praxisFingerprint: findingFingerprint(f) },
    };
  });

  return {
    $schema: SCHEMA,
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: toolName, version: toolVersion, informationUri, rules } },
      results,
    }],
  };
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `node test/lib/sarif.test.mjs`
Expected: PASS — `sarif.test ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/sarif.mjs test/lib/sarif.test.mjs
git commit --no-verify -m "feat(sarif): formateador toSarif (SARIF 2.1.0, determinista)"
```

---

## Task 2: Helper de gate — `lib/gate.mjs`

**Files:**
- Create: `lib/gate.mjs`
- Test: `test/lib/gate.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lib/gate.test.mjs`:

```js
import assert from 'node:assert/strict';
import { gateExitCode } from '../../lib/gate.mjs';

const info = { severity: 'info' }, warn = { severity: 'warn' }, error = { severity: 'error' };

// default minSeverity = warn
assert.equal(gateExitCode([info], {}), 0, 'info no frena con default warn');
assert.equal(gateExitCode([warn], {}), 1, 'warn frena');
assert.equal(gateExitCode([error], {}), 1, 'error frena');
assert.equal(gateExitCode([], {}), 0, 'sin findings no frena');

// minSeverity = info -> hasta info frena
assert.equal(gateExitCode([info], { commit: { minSeverity: 'info' } }), 1);
// minSeverity = error -> solo error frena
assert.equal(gateExitCode([warn], { commit: { minSeverity: 'error' } }), 0);
assert.equal(gateExitCode([error], { commit: { minSeverity: 'error' } }), 1);

console.log('gate.test ok');
```

- [ ] **Step 2: Correr para ver que falla**

Run: `node test/lib/gate.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/gate.mjs'`.

- [ ] **Step 3: Implementar el módulo**

Crear `lib/gate.mjs`:

```js
// lib/gate.mjs
// Decide el exit code de un gate (pre-commit / CI) según commit.minSeverity.
const RANK = { info: 1, warn: 2, error: 3 };

export function gateExitCode(findings, config = {}) {
  const commit = config.commit || {};
  const min = RANK[commit.minSeverity] || 2;   // default warn
  return findings.some((f) => (RANK[f.severity] || 1) >= min) ? 1 : 0;
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `node test/lib/gate.test.mjs`
Expected: PASS — `gate.test ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/gate.mjs test/lib/gate.test.mjs
git commit --no-verify -m "feat(gate): helper gateExitCode (umbral commit.minSeverity)"
```

---

## Task 3: Wiring en el runner — `bin/praxis-audit.mjs`

**Files:**
- Modify: `bin/praxis-audit.mjs`
- Create: `test/fixtures/sarif-project/tsconfig.json`
- Create: `test/fixtures/sarif-project/a.ts`
- Create: `test/fixtures/sarif-project/.praxis-guard/config.json`
- Test: `test/bin/praxis-audit-sarif.test.mjs`

- [ ] **Step 1: Crear el fixture**

Crear `test/fixtures/sarif-project/tsconfig.json`:

```json
{ "compilerOptions": { "strict": true, "skipLibCheck": true }, "include": ["*.ts"] }
```

Crear `test/fixtures/sarif-project/a.ts` (dispara `stringly-typed`, severidad `info`):

```ts
export function f(x: string) { return x === 'a' || x === 'b'; }
```

Crear `test/fixtures/sarif-project/.praxis-guard/config.json` (baja el umbral a info para el test del gate):

```json
{ "commit": { "minSeverity": "info" } }
```

- [ ] **Step 2: Escribir el test que falla**

Crear `test/bin/praxis-audit-sarif.test.mjs`:

```js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const audit = join(repo, 'bin', 'praxis-audit.mjs');

// copiamos el fixture a tmp (el audit escribe meta.json; no ensuciar el repo).
const proj = mkdtempSync(join(tmpdir(), 'sarif-'));
cpSync(join(here, '..', 'fixtures', 'sarif-project'), proj, { recursive: true });

// 1. --format sarif -> stdout es SARIF válido con el finding stringly-typed.
const out = execFileSync('node', [audit, '--full', '--format', 'sarif', '--dir', proj], { encoding: 'utf8' });
const sarif = JSON.parse(out);   // stdout debe ser SOLO SARIF (si stderr se mezcló, esto rompe)
assert.equal(sarif.version, '2.1.0');
assert.ok(sarif.runs[0].results.some((r) => r.ruleId === 'stringly-typed'), 'esperaba finding stringly-typed');

// 2. --gate con minSeverity info (del config del fixture) -> exit 1, y el SARIF igual sale por stdout.
let code = 0, gateOut = '';
try { gateOut = execFileSync('node', [audit, '--full', '--format', 'sarif', '--gate', '--dir', proj], { encoding: 'utf8' }); }
catch (e) { code = e.status; gateOut = e.stdout; }
assert.equal(code, 1, 'gate debe frenar (exit 1)');
JSON.parse(gateOut);   // el SARIF se escribió antes del exit

console.log('praxis-audit-sarif.test ok');
```

- [ ] **Step 3: Correr para ver que falla**

Run: `node test/bin/praxis-audit-sarif.test.mjs`
Expected: FAIL — `out` no parsea como JSON (hoy el runner imprime texto humano), o `--format`/`--gate` se ignoran.

- [ ] **Step 4: Modificar `bin/praxis-audit.mjs`**

(a) Agregar imports después de `import { loadCustomRules, readCustomRuleSources } from '../lib/custom-rules.mjs';`:

```js
import { toSarif } from '../lib/sarif.mjs';
import { gateExitCode } from '../lib/gate.mjs';
```

(b) Después de `const config = loadConfig(...)` (y antes de `const custom = await loadCustomRules(dir);`), agregar:

```js
const format = arg('format', 'human');
const note = (m) => (format === 'sarif' ? console.error(m) : console.log(m));
```

(c) Cambiar el loop de errores de reglas custom (`for (const e of custom.errors) console.log(...)`) para usar `note`:

```js
for (const e of custom.errors) note(`⚠ regla custom "${e.id}" no cargó: ${e.error}`);
```

(d) En `runAstRules`, cambiar el `console.log('praxis-audit: reglas AST omitidas...')` por `note(...)`:

```js
    note('praxis-audit: reglas AST omitidas — typescript no está instalado en el proyecto.');
```

(e) Reemplazar el bloque de salida (desde `report(shown);` hasta el `console.log` del else de baseline) por:

```js
if (format === 'sarif') {
  process.stdout.write(JSON.stringify(toSarif(shown, { toolName: 'nextjs-praxis-guard', toolVersion: ver })) + '\n');
} else {
  report(shown);
}
const modeStr = `modo ${mode}${ranProject ? ' (con project rules)' : ''}`;
if (baseline) {
  note(`praxis-audit: ${shown.length} nuevo(s), ${suppressed.length} ocultos por baseline. ${modeStr}.`);
  if (mode === 'full' && resolvedCount > 0) {
    note(`ℹ ${resolvedCount} findings de la baseline ya están resueltos — corré --update-baseline para limpiarlos.`);
  }
} else {
  note(`praxis-audit: ${modeStr}.`);
}
```

(f) Reemplazar el bloque del gate (`// Bloqueo de commit configurable.` ... `process.exit(exitCode);`) por:

```js
// Gate de exit code: pre-commit (commit.block en --staged) o --gate (CI).
const gate = process.argv.includes('--gate');
let exitCode = 0;
if (gate || (mode === 'staged' && (config.commit || {}).block)) {
  exitCode = gateExitCode(shown, config);
}
process.exit(exitCode);
```

- [ ] **Step 5: Correr el test (y la suite)**

Run: `node test/bin/praxis-audit-sarif.test.mjs`
Expected: PASS — `praxis-audit-sarif.test ok`.

Run: `node test/run.mjs`
Expected: todo verde (el cambio del gate no debe romper los tests de `--staged`).

- [ ] **Step 6: Verificar el modo humano intacto**

Run: `node bin/praxis-audit.mjs --full --dir test/fixtures/sarif-project`
Expected: imprime el reporte humano normal (texto), exit 0.

- [ ] **Step 7: Commit**

```bash
git add bin/praxis-audit.mjs test/bin/praxis-audit-sarif.test.mjs test/fixtures/sarif-project/
git commit --no-verify -m "feat: praxis-audit --format sarif + --gate"
```

---

## Task 4: Template del workflow + instalación

**Files:**
- Create: `cli/github-action.yml`
- Modify: `bin/install-hooks.mjs`
- Test: `test/bin/install-github-action.test.mjs`

- [ ] **Step 1: Crear el template**

Crear `cli/github-action.yml`:

```yaml
name: praxis-guard
on: pull_request
permissions:
  contents: read
  security-events: write
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: clone praxis-guard plugin
        # repo privado: reemplazá la URL por https con ${{ secrets.PRAXIS_PLUGIN_TOKEN }} (ver README)
        run: git clone --depth 1 --branch __PLUGIN_REF__ __PLUGIN_URL__ "$RUNNER_TEMP/praxis-plugin"
      - name: praxis-audit
        id: audit
        continue-on-error: true
        run: node "$RUNNER_TEMP/praxis-plugin/bin/praxis-audit.mjs" --full --deep --format sarif --gate > praxis.sarif
      - name: upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: praxis.sarif
      - name: gate
        if: steps.audit.outcome == 'failure'
        run: exit 1
```

- [ ] **Step 2: Escribir el test que falla**

Crear `test/bin/install-github-action.test.mjs`:

```js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const installer = join(repo, 'bin', 'install-hooks.mjs');

const target = mkdtempSync(join(tmpdir(), 'gha-'));
execFileSync('node', [installer, '--cli', 'github-action', '--target', target], { encoding: 'utf8' });

const wf = join(target, '.github', 'workflows', 'praxis-audit.yml');
assert.ok(existsSync(wf), 'esperaba el workflow generado');
const body = readFileSync(wf, 'utf8');
assert.ok(!body.includes('__PLUGIN_URL__'), 'placeholder URL sin reemplazar');
assert.ok(!body.includes('__PLUGIN_REF__'), 'placeholder REF sin reemplazar');
assert.ok(body.includes('praxis-audit.mjs'), 'debe invocar el motor');
assert.ok(body.includes('--format sarif'), 'debe usar SARIF');
assert.ok(body.includes('upload-sarif'), 'debe subir el SARIF');

console.log('install-github-action.test ok');
```

- [ ] **Step 3: Correr para ver que falla**

Run: `node test/bin/install-github-action.test.mjs`
Expected: FAIL — `install-hooks` no conoce `--cli github-action` (sale con exit 1 / usage), el workflow no existe.

- [ ] **Step 4: Modificar `bin/install-hooks.mjs`**

(a) Agregar `execSync` al import de `node:child_process` (nuevo import después de la línea de `node:path`):

```js
import { execSync } from 'node:child_process';
```

(b) Agregar una función helper antes del `switch (cli)`:

```js
function pluginGitUrl() {
  try { return execSync('git remote get-url origin', { cwd: PLUGIN_ROOT, encoding: 'utf8' }).trim(); }
  catch { return '<PLUGIN_GIT_URL>'; }
}
function pluginRef() {
  try {
    const m = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    return m.version ? `v${m.version}` : 'main';
  } catch { return 'main'; }
}
```

(c) Agregar un case nuevo en el `switch (cli)` (antes del `default:`):

```js
  case 'github-action': {
    const destDir = join(target, '.github', 'workflows');
    mkdirSync(destDir, { recursive: true });
    const body = readFileSync(join(PLUGIN_ROOT, 'cli/github-action.yml'), 'utf8')
      .replace(/__PLUGIN_URL__/g, pluginGitUrl())
      .replace(/__PLUGIN_REF__/g, pluginRef());
    const dest = join(destDir, 'praxis-audit.yml');
    writeFileSync(dest, body);
    console.log(`installed github-action workflow -> ${dest}`);
    break;
  }
```

(d) Actualizar el mensaje de `default:` (usage) para incluir `github-action`:

```js
    console.error('usage: node bin/install-hooks.mjs --target <dir> --cli <copilot|codex|opencode|precommit|github-action>');
```

- [ ] **Step 5: Correr el test**

Run: `node test/bin/install-github-action.test.mjs`
Expected: PASS — `install-github-action.test ok`.

- [ ] **Step 6: Commit**

```bash
git add cli/github-action.yml bin/install-hooks.mjs test/bin/install-github-action.test.mjs
git commit --no-verify -m "feat: install-hooks --cli github-action (workflow SARIF)"
```

---

## Task 5: Suite verde + docs

**Files:**
- Modify: `AGENTS.md` (`CLAUDE.md` es symlink a este)
- Modify: `README.md`
- Modify: `skills/praxis-audit/SKILL.md`

- [ ] **Step 1: Suite completa**

Run: `node test/run.mjs`
Expected: todo verde (los 4 nuevos tests + los previos). Si algo falla, arreglar antes de seguir.

- [ ] **Step 2: Actualizar `AGENTS.md`**

En la sección "Auditoría de proyecto", después del párrafo del modo profundo, agregar:

```markdown

Para CI: `praxis-audit --format sarif` emite los findings en SARIF 2.1.0 (estándar neutral,
lo lee GitHub code scanning) y `--gate` hace exit 1 si hay findings nuevos ≥ `commit.minSeverity`.
Instalá el workflow de GitHub Action con `node bin/install-hooks.mjs --cli github-action --target <proyecto>`
(corre `--full --deep --format sarif --gate` en cada PR y comenta las líneas). Repo del plugin
privado → configurá un `PRAXIS_PLUGIN_TOKEN` en el clone (ver README).
```

- [ ] **Step 3: Actualizar `README.md`**

Localizar la sección de instalación multi-CLI (buscar `install-hooks` o `--cli precommit`) y agregar
la línea del github-action, más una nota de repo privado. Agregar (adaptando al formato existente):

```markdown
### CI: GitHub Action (code scanning)

`node bin/install-hooks.mjs --cli github-action --target <proyecto>` escribe
`.github/workflows/praxis-audit.yml`. En cada PR corre la auditoría profunda y sube los findings
como anotaciones (code scanning); frena el merge si hay findings nuevos ≥ `commit.minSeverity`.

El workflow clona el plugin a un ref fijado. Si el repo del plugin es **privado**, cambiá la URL
del paso `clone praxis-guard plugin` por `https://x-access-token:${{ secrets.PRAXIS_PLUGIN_TOKEN }}@github.com/<owner>/<repo>.git`
y definí ese secret en el proyecto.

También: `praxis-audit --format sarif` (SARIF 2.1.0 a stdout) y `--gate` (exit 1 por findings ≥ umbral)
sirven para cualquier otro CI.
```

- [ ] **Step 4: Actualizar la skill `praxis-audit`**

En `skills/praxis-audit/SKILL.md`, en la lista "Cómo correrlo", agregar:

```markdown
- CI / SARIF: `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --full --deep --format sarif --gate --dir <proyecto>`
  - `--format sarif`: a stdout va solo el JSON SARIF (diagnósticos a stderr). `--gate`: exit 1 si
    hay findings ≥ `commit.minSeverity`. Es plomería de CI (lo usa el workflow `github-action`), no
    UX humana cotidiana.
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md skills/praxis-audit/SKILL.md
git commit --no-verify -m "docs: salida SARIF + workflow CI en README, AGENTS y skill"
```

---

## Task 6: Cerrar la tarea y la rama

- [ ] **Step 1: Suite final**

Run: `node test/run.mjs`
Expected: todo verde, exit 0.

- [ ] **Step 2: Marcar el TODO como hecho**

Invocar la skill `todo-plugin:todo-done` para mover *"Salida SARIF + GitHub Action"* de
`.todo/TODO.md` a `.todo/DONE.md`.

- [ ] **Step 3: Finalizar la rama**

Invocar `superpowers:finishing-a-development-branch` para decidir merge / PR de `feat/sarif-github-action`.

---

## Self-review (cobertura del spec)

- **§A formateador `lib/sarif.mjs`** → Task 1. ✅
- **§B.1 `--format sarif` (stdout limpio, stderr diagnósticos, post-baseline)** → Task 3 (e). ✅
- **§B.2 `--gate` + helper `gateExitCode`** → Task 2 + Task 3 (f). ✅
- **§C.1 template `cli/github-action.yml`** → Task 4 (step 1). ✅
- **§C.2 `install-hooks --cli github-action` (inyecta url/ref)** → Task 4 (step 4). ✅
- **§D config (reusa commit.minSeverity)** → Task 2 (gateExitCode lee commit.minSeverity). ✅
- **§E tests (sarif, gate, runner e2e, install)** → Tasks 1, 2, 3, 4. ✅
- **§F docs** → Task 5. ✅

Sin placeholders. Firmas consistentes: `toSarif(findings, { toolName, toolVersion })` definida en Task 1
y usada igual en Task 3 (e); `gateExitCode(findings, config)` definida en Task 2 y usada en Task 3 (f).
El fixture `sarif-project` dispara `stringly-typed` (info) y su config baja `minSeverity` a info para
ejercitar el exit 1 del gate end-to-end.
