# Baseline / suppress para praxis-audit — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `praxis-audit` acepte la deuda actual en una baseline y por defecto muestre solo findings nuevos.

**Architecture:** Un módulo `lib/baseline.mjs` calcula la huella de cada finding (`sha256(rule+file+message)`, sin línea), lee/escribe `.praxis-guard/baseline.json` y filtra. `bin/praxis-audit.mjs` suma `--update-baseline` (snapshot full) y `--no-baseline`, filtra el reporte y hace que el bloqueo de `--staged` opere sobre los findings no-baselined.

**Tech Stack:** Node ≥18, ESM `.mjs`, zero-dep. Tests = scripts `.mjs` con `node:assert/strict`, corridos por `test/run.mjs`. Correr todo: `npm test`. Correr uno: `node test/ruta.test.mjs`.

**Spec:** `docs/specs/2026-06-15-audit-baseline-design.md`

**Anchors actuales de `bin/praxis-audit.mjs`** (verificados):
- Helpers hoisted: `runFileRules(relPaths)`, `runProjectRules()`, `report(findings)`, `pluginVersion()`, `enumerateFiles` (importado).
- `config.detected = detectStack(dir)` se setea cerca del top; el bloque early-exit de `--fix-tsconfig` está justo después.
- Recolección: líneas ~142-154 dejan `findings` (según `mode`).
- Cierre: `report(findings)` + `console.log('praxis-audit: modo ...')` (~156-157).
- Bloqueo staged: `if (mode === 'staged') { ... findings.some(...) → exitCode = 1 }` (~166-174), luego `process.exit(exitCode)`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/baseline.mjs` (new) | `findingFingerprint`, `readBaseline`, `writeBaseline`, `applyBaseline` |
| `bin/praxis-audit.mjs` (mod) | flags `--update-baseline`/`--no-baseline`, filtrado, cierre, aviso huérfanas, staged sobre `shown` |
| `skills/praxis-audit/SKILL.md` (mod) | documentar baseline |
| `README.md`, `AGENTS.md` (mod) | documentar adopción en repo legacy |

---

## Task 1: `lib/baseline.mjs`

**Files:**
- Create: `lib/baseline.mjs`
- Test: `test/lib/baseline.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/lib/baseline.test.mjs`:

```js
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findingFingerprint, readBaseline, writeBaseline, applyBaseline } from '../../lib/baseline.mjs';
import assert from 'node:assert/strict';

// huella estable: misma rule/file/message, línea distinta -> misma huella
const a = findingFingerprint({ rule: 'secrets', file: 'src/a.ts', line: 3, message: 'X' });
const b = findingFingerprint({ rule: 'secrets', file: 'src/a.ts', line: 99, message: 'X' });
assert.equal(a, b, 'la línea no afecta la huella');
assert.ok(a.startsWith('sha256:'));
// cambiar el message -> huella distinta
assert.notEqual(a, findingFingerprint({ rule: 'secrets', file: 'src/a.ts', line: 3, message: 'Y' }));

// read/write roundtrip
const dir = mkdtempSync(join(tmpdir(), 'praxis-baseline-'));
try {
  assert.equal(readBaseline(dir), null, 'sin archivo -> null');
  writeBaseline(dir, [a, 'sha256:zzz'], { created_at: '2026-06-15', plugin_version: '0.2.0' });
  const bl = readBaseline(dir);
  assert.deepEqual(bl.fingerprints, [a, 'sha256:zzz']);
  assert.equal(bl.created_at, '2026-06-15');
  const onDisk = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'baseline.json'), 'utf8'));
  assert.ok(Array.isArray(onDisk.fingerprints));

  // applyBaseline: separa shown/suppressed + cuenta resolved
  const findings = [
    { rule: 'secrets', file: 'src/a.ts', line: 5, message: 'X' },   // huella a -> baselined
    { rule: 'secrets', file: 'src/b.ts', line: 1, message: 'NEW' }, // nuevo
  ];
  const res = applyBaseline(findings, bl);
  assert.equal(res.suppressed.length, 1);
  assert.equal(res.shown.length, 1);
  assert.equal(res.shown[0].message, 'NEW');
  assert.equal(res.resolvedCount, 1, 'sha256:zzz no apareció -> 1 resuelto');

  // baseline null -> todo shown
  const res2 = applyBaseline(findings, null);
  assert.equal(res2.shown.length, 2);
  assert.equal(res2.resolvedCount, 0);
  console.log('baseline.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/baseline.test.mjs`

- [ ] **Step 3: Implementar `lib/baseline.mjs`**

```js
// lib/baseline.mjs
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Huella de un finding: sha256(rule + file + message). NO incluye la línea
// (robusto al drift). Dos findings idénticos en un archivo colapsan en una huella.
export function findingFingerprint(f) {
  const h = createHash('sha256');
  h.update(String(f.rule) + '\0' + String(f.file) + '\0' + String(f.message));
  return 'sha256:' + h.digest('hex');
}

export function baselinePath(dir) { return join(dir, '.praxis-guard', 'baseline.json'); }

export function readBaseline(dir) {
  try {
    const obj = JSON.parse(readFileSync(baselinePath(dir), 'utf8'));
    return (obj && Array.isArray(obj.fingerprints)) ? obj : null;
  } catch { return null; }
}

export function writeBaseline(dir, fingerprints, meta = {}) {
  const obj = {
    created_at: meta.created_at || '',
    plugin_version: meta.plugin_version || '',
    fingerprints: [...fingerprints],
  };
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  const p = baselinePath(dir);
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, p);
  return obj;
}

// Parte findings en { shown, suppressed, resolvedCount }.
// resolvedCount = huellas en la baseline que NO aparecieron en `findings`.
export function applyBaseline(findings, baseline) {
  if (!baseline || !Array.isArray(baseline.fingerprints)) {
    return { shown: findings, suppressed: [], resolvedCount: 0 };
  }
  const accepted = new Set(baseline.fingerprints);
  const seen = new Set();
  const shown = [], suppressed = [];
  for (const f of findings) {
    const fp = findingFingerprint(f);
    seen.add(fp);
    if (accepted.has(fp)) suppressed.push(f);
    else shown.push(f);
  }
  let resolvedCount = 0;
  for (const fp of accepted) if (!seen.has(fp)) resolvedCount++;
  return { shown, suppressed, resolvedCount };
}
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/lib/baseline.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add lib/baseline.mjs test/lib/baseline.test.mjs
git commit -m "feat(lib): baseline.mjs (fingerprint + read/write + applyBaseline)"
```

---

## Task 2: Flag `--update-baseline`

Snapshotea todos los findings actuales (full) en `baseline.json`. Early-exit, no reporta.

**Files:**
- Modify: `bin/praxis-audit.mjs`
- Test: `test/bin/praxis-audit-update-baseline.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/bin/praxis-audit-update-baseline.test.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-updbl-'));
try {
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { secrets: { enabled: true } } }));
  writeFileSync(join(dir, 'src', 'leak.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef";');

  const r = spawnSync('node', [AUDIT, '--update-baseline', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /baseline actualizada/);
  assert.ok(existsSync(join(dir, '.praxis-guard', 'baseline.json')), 'escribió baseline.json');
  const bl = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'baseline.json'), 'utf8'));
  assert.ok(bl.fingerprints.length >= 1, 'capturó al menos 1 huella');
  console.log('praxis-audit-update-baseline.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

- [ ] **Step 2: Correr → falla.** Run: `node test/bin/praxis-audit-update-baseline.test.mjs`

- [ ] **Step 3: Modificar `bin/praxis-audit.mjs`** (read it first)

(a) Agregar import junto a los otros lib imports del top:

```js
import { findingFingerprint, readBaseline, writeBaseline, applyBaseline } from '../lib/baseline.mjs';
```

(b) Insertar el bloque early-exit INMEDIATAMENTE DESPUÉS del bloque `if (process.argv.includes('--fix-tsconfig')) { ... }` (ambos son early-exits que van antes de la lógica de modo). `enumerateFiles`, `runFileRules`, `runProjectRules` y `pluginVersion` son hoisted, así que se pueden llamar acá:

```js
if (process.argv.includes('--update-baseline')) {
  const files = enumerateFiles(dir, config);
  const all = [...runFileRules(files), ...runProjectRules()];
  const fps = [...new Set(all.map(findingFingerprint))];
  const old = readBaseline(dir);
  const oldSet = new Set(old ? old.fingerprints : []);
  const resolved = [...oldSet].filter((x) => !fps.includes(x)).length;
  writeBaseline(dir, fps, { created_at: new Date().toISOString().slice(0, 10), plugin_version: pluginVersion() });
  console.log(`praxis-audit: baseline actualizada — ${fps.length} aceptados (${resolved} resueltos salieron).`);
  process.exit(0);
}
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/bin/praxis-audit-update-baseline.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add bin/praxis-audit.mjs test/bin/praxis-audit-update-baseline.test.mjs
git commit -m "feat(audit): flag --update-baseline (snapshot full a baseline.json)"
```

---

## Task 3: Filtrado por baseline + `--no-baseline` + aviso huérfanas

**Files:**
- Modify: `bin/praxis-audit.mjs`
- Test: `test/bin/praxis-audit-baseline-filter.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/bin/praxis-audit-baseline-filter.test.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');
function run(dir, ...args) { return spawnSync('node', [AUDIT, ...args, '--dir', dir], { encoding: 'utf8' }); }

const dir = mkdtempSync(join(tmpdir(), 'praxis-blfilter-'));
try {
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { secrets: { enabled: true } } }));
  writeFileSync(join(dir, 'src', 'old.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef";');

  // aceptar la deuda actual
  assert.equal(run(dir, '--update-baseline').status, 0);

  // agregar un finding NUEVO
  writeFileSync(join(dir, 'src', 'new.ts'), 'const z = "sk_live_ffffffffffffffffffffffffffffffff";');

  // default: oculta el viejo, muestra solo el nuevo
  const r = run(dir, '--full');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /new\.ts/, 'muestra el finding nuevo');
  assert.doesNotMatch(r.stdout, /old\.ts/, 'oculta el viejo (baselined)');
  assert.match(r.stdout, /ocultos por baseline/, 'reporta el contador');

  // --no-baseline: muestra todo
  const r2 = run(dir, '--full', '--no-baseline');
  assert.match(r2.stdout, /old\.ts/, '--no-baseline muestra el viejo');
  assert.match(r2.stdout, /new\.ts/);
  console.log('praxis-audit-baseline-filter.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

- [ ] **Step 2: Correr → falla.** Run: `node test/bin/praxis-audit-baseline-filter.test.mjs`

- [ ] **Step 3: Modificar `bin/praxis-audit.mjs`**

Reemplazar el bloque de cierre actual:

```js
report(findings);
console.log(`praxis-audit: modo ${mode}${ranProject ? ' (con project rules)' : ''}.`);
```

por:

```js
const baseline = process.argv.includes('--no-baseline') ? null : readBaseline(dir);
const { shown, suppressed, resolvedCount } = applyBaseline(findings, baseline);

report(shown);
const modeStr = `modo ${mode}${ranProject ? ' (con project rules)' : ''}`;
if (baseline) {
  console.log(`praxis-audit: ${shown.length} nuevo(s), ${suppressed.length} ocultos por baseline. ${modeStr}.`);
  if (mode === 'full' && resolvedCount > 0) {
    console.log(`ℹ ${resolvedCount} findings de la baseline ya están resueltos — corré --update-baseline para limpiarlos.`);
  }
} else {
  console.log(`praxis-audit: ${modeStr}.`);
}
```

> `shown` queda declarado en este scope para que el bloque de bloqueo de `--staged` (Task 4) lo use.

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/bin/praxis-audit-baseline-filter.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add bin/praxis-audit.mjs test/bin/praxis-audit-baseline-filter.test.mjs
git commit -m "feat(audit): filtrado por baseline + --no-baseline + aviso huérfanas"
```

---

## Task 4: `--staged` bloquea sobre `shown` (post-baseline)

**Files:**
- Modify: `bin/praxis-audit.mjs`
- Test: `test/bin/praxis-audit-staged-baseline.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/bin/praxis-audit-staged-baseline.test.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');
function git(dir, args) { return spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); }

const dir = mkdtempSync(join(tmpdir(), 'praxis-stbl-'));
try {
  git(dir, ['init', '-q']); git(dir, ['config', 'user.email', 't@t.t']); git(dir, ['config', 'user.name', 't']);
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { secrets: { enabled: true } }, commit: { check: true, block: true, minSeverity: 'warn' } }));
  writeFileSync(join(dir, 'src', 'old.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef";');
  git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'init']);

  // aceptar la deuda actual (incluye old.ts)
  assert.equal(spawnSync('node', [AUDIT, '--update-baseline', '--dir', dir], { encoding: 'utf8' }).status, 0);

  // staged solo old.ts (baselined) -> NO bloquea
  writeFileSync(join(dir, 'src', 'old.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef"; // edit');
  git(dir, ['add', 'src/old.ts']);
  let r = spawnSync('node', [AUDIT, '--staged', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'baselined staged no bloquea');

  // staged un finding NUEVO -> bloquea
  writeFileSync(join(dir, 'src', 'new.ts'), 'const z = "sk_live_ffffffffffffffffffffffffffffffff";');
  git(dir, ['add', 'src/new.ts']);
  r = spawnSync('node', [AUDIT, '--staged', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1, 'finding nuevo staged bloquea');
  console.log('praxis-audit-staged-baseline.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

- [ ] **Step 2: Correr → falla.** Run: `node test/bin/praxis-audit-staged-baseline.test.mjs`

- [ ] **Step 3: Modificar `bin/praxis-audit.mjs`**

En el bloque de bloqueo de commit, cambiar la línea que evalúa `findings.some(...)` por `shown.some(...)`:

```js
    if (shown.some((f) => (rank[f.severity] || 1) >= min)) exitCode = 1;
```

(El resto del bloque `if (mode === 'staged') { ... }` queda igual. `shown` está en scope desde Task 3.)

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/bin/praxis-audit-staged-baseline.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add bin/praxis-audit.mjs test/bin/praxis-audit-staged-baseline.test.mjs
git commit -m "feat(audit): --staged respeta la baseline (bloquea solo lo nuevo)"
```

---

## Task 5: Documentación

**Files:**
- Modify: `skills/praxis-audit/SKILL.md`
- Modify: `AGENTS.md` (CLAUDE.md es symlink → editar AGENTS.md)
- Modify: `README.md`

- [ ] **Step 1: `skills/praxis-audit/SKILL.md`** — bajo "Cómo correrlo", agregar:

```markdown
- Aceptar la deuda actual (baseline): `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --update-baseline --dir <proyecto>`
  - Snapshotea TODOS los findings actuales en `.praxis-guard/baseline.json` (committealo). Desde
    ahí, las corridas normales ocultan esos y muestran solo lo **nuevo**.
- Ver todo (ignorar baseline): agregá `--no-baseline`.
```

Y bajo "Proceso", agregar un punto:

```markdown
5. Si el audit avisa que hay findings de la baseline ya resueltos, sugerí `--update-baseline`
   para limpiarlos (evita que una regresión futura quede oculta por una huella huérfana).
```

- [ ] **Step 2: `AGENTS.md`** — en la sección "## Auditoría de proyecto", agregar al final:

```markdown
Para adoptar el auditor en un repo con deuda existente: `praxis-audit --update-baseline` acepta
los findings actuales en `.praxis-guard/baseline.json` (committealo); desde ahí solo verás los
**nuevos**. `--no-baseline` muestra todo. El pre-commit también respeta la baseline (no bloquea
por deuda ya aceptada, solo por findings nuevos).
```

- [ ] **Step 3: `README.md`** — en la sección "## Auditoría de proyecto completo", después del bloque
  de comandos `praxis-audit`, agregar una subsección:

```markdown
### Baseline (adopción en repos con deuda)

Correr el auditor en un repo grande existente puede tirar cientos de findings. Para adoptarlo sin
ruido, aceptá la deuda actual una vez:

```bash
node bin/praxis-audit.mjs --update-baseline --dir <proyecto>
```

Eso guarda las huellas de los findings actuales en `.praxis-guard/baseline.json` (committealo: es
deuda compartida). Desde ahí, `praxis-audit` por defecto **oculta** esos y muestra solo los
findings **nuevos**, con un contador `N ocultos por baseline`. La huella es `sha256(regla + archivo
+ mensaje)` — **sin** número de línea, así que sobrevive a que el código se mueva.

- `--no-baseline`: muestra todo, ignorando la baseline.
- Cuando arreglás findings baselined, sus huellas quedan huérfanas; un audit `--full` te avisa
  cuántas hay y `--update-baseline` re-snapshotea (limpia las resueltas).
- El pre-commit (`--staged`) respeta la baseline: no te bloquea por deuda ya aceptada, solo por
  findings nuevos.
```

- [ ] **Step 4: Verificar y commit**

Run: `npm test` (Expected: todos los test files pasan)

```bash
git add skills/praxis-audit/SKILL.md AGENTS.md README.md
git commit -m "docs: baseline/suppress (adopción en repos con deuda)"
```

---

## Self-review (cobertura del spec)

- **A.1 lib/baseline.mjs** (findingFingerprint sin línea, read/write, applyBaseline con shown/suppressed/resolvedCount) → Task 1.
- **A.2 baseline.json** (shape, dónde vive, committeable) → Task 1 (writeBaseline) + Task 2 (lo escribe el CLI) + docs Task 5.
- **A.3 relación con lo existente** → no toca meta.json ni reglas; verificado en Task 1/2.
- **B.1 --update-baseline (full snapshot)** → Task 2. **--no-baseline** → Task 3. **Default filtra** → Task 3.
- **B.2 filtrado + cierre + aviso huérfanas solo en full** → Task 3.
- **B.3 --staged respeta baseline (bloquea sobre shown)** → Task 4.
- **B.4 orden de operaciones (update-baseline early-exit; filtrado antes de report y del exitCode)** → Task 2 (early-exit) + Task 3 (filtrado antes de report) + Task 4 (exitCode sobre shown).
- **C componentes / D testing / E riesgos** → cubiertos; el riesgo de regresión silenciosa se mitiga con el aviso de huérfanas (Task 3).

Consistencia de nombres: `findingFingerprint`, `readBaseline`, `writeBaseline`, `applyBaseline`
({shown, suppressed, resolvedCount}), flags `--update-baseline`/`--no-baseline`, archivo
`.praxis-guard/baseline.json`.
