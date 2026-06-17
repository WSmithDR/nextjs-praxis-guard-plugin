# Respetar `.gitignore` + exclusión guiada — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el plugin no audite archivos que git ignora (flag `respectGitignore`, vía git, en hook + auditor) y que `praxis-config` ayude a excluir directorios de "no-código-propio".

**Architecture:** Un módulo `lib/gitignore.mjs` (backend git, fail-open) que filtra/chequea archivos ignorados; integrado en `lib/walk.mjs` (auditor) y `hooks/detect.mjs` (hook) detrás del flag `respectGitignore`. Un módulo `lib/exclude-candidates.mjs` que sugiere dirs a excluir, expuesto por `bin/praxis-config.mjs suggest-excludes` y consumido por la skill.

**Tech Stack:** Node ≥18 ESM, `git` CLI (vía `node:child_process`), test runner casero (`node test/run.mjs`).

**Spec:** `docs/specs/2026-06-17-gitignore-and-exclude-design.md`

## Global Constraints

- **Fail-open siempre:** sin `git` / sin repo / cualquier error → comportarse como hoy (no ignora nada). Nunca lanzar.
- **`respectGitignore` default `false`** en `config/defaults.json` (off hasta que `praxis-config` lo confirme).
- Commits con `git commit --no-verify` (el pre-commit del repo sale ≠0 por diseño). Autobump activo (sincroniza manifiestos) — esperado.
- ESM, zero-dep nuevo. `git` se invoca con `execFileSync` (no `execSync` con interpolación).

---

## Task 1: `lib/gitignore.mjs` — filtro/chequeo git (fail-open)

**Files:**
- Create: `lib/gitignore.mjs`
- Test: `test/lib/gitignore.test.mjs`

**Interfaces:**
- Produces: `filterGitIgnored(dir: string, relPaths: string[]) => string[]` (subconjunto NO ignorado); `isGitIgnored(dir: string, relPath: string) => boolean`.

- [ ] **Step 1: Write the failing test** — `test/lib/gitignore.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { filterGitIgnored, isGitIgnored } from '../../lib/gitignore.mjs';

// repo git temporal con .gitignore
const repo = mkdtempSync(join(tmpdir(), 'gi-repo-'));
execFileSync('git', ['-C', repo, 'init', '-q']);
writeFileSync(join(repo, '.gitignore'), 'dist/\n*.log\n');
mkdirSync(join(repo, 'dist'), { recursive: true });
mkdirSync(join(repo, 'src'), { recursive: true });
writeFileSync(join(repo, 'dist', 'x.js'), '');
writeFileSync(join(repo, 'app.log'), '');
writeFileSync(join(repo, 'src', 'a.tsx'), '');

const kept = filterGitIgnored(repo, ['dist/x.js', 'app.log', 'src/a.tsx']);
assert.deepEqual(kept, ['src/a.tsx'], `kept=${JSON.stringify(kept)}`);
assert.equal(isGitIgnored(repo, 'dist/x.js'), true);
assert.equal(isGitIgnored(repo, 'src/a.tsx'), false);

// directorio que NO es repo git -> fail-open: devuelve todo, nada ignorado
const plain = mkdtempSync(join(tmpdir(), 'gi-plain-'));
assert.deepEqual(filterGitIgnored(plain, ['a.ts', 'b.ts']), ['a.ts', 'b.ts']);
assert.equal(isGitIgnored(plain, 'a.ts'), false);

// lista vacía no rompe
assert.deepEqual(filterGitIgnored(repo, []), []);

console.log('gitignore.test ok');
```

Run: `node test/lib/gitignore.test.mjs` → FAIL (module not found).

- [ ] **Step 2: Implement** — `lib/gitignore.mjs`:

```js
// lib/gitignore.mjs
// Filtra/chequea archivos ignorados por git. Fail-open: sin git / sin repo / error -> no ignora nada.
import { execFileSync } from 'node:child_process';

function insideRepo(dir) {
  try {
    execFileSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

// Set de los relPaths ignorados (subconjunto de los pasados). `git check-ignore --stdin`
// imprime los ignorados (uno por línea); exit 1 = ninguno (execFileSync tira -> leemos e.stdout).
function ignoredSet(dir, relPaths) {
  let out = '';
  try {
    out = execFileSync('git', ['-C', dir, 'check-ignore', '--stdin'],
      { input: relPaths.join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (e) {
    out = (e && typeof e.stdout === 'string') ? e.stdout : '';
  }
  return new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
}

export function filterGitIgnored(dir, relPaths) {
  if (!relPaths || !relPaths.length) return relPaths || [];
  if (!insideRepo(dir)) return relPaths;
  const ignored = ignoredSet(dir, relPaths);
  return relPaths.filter((p) => !ignored.has(p));
}

export function isGitIgnored(dir, relPath) {
  if (!relPath) return false;
  if (!insideRepo(dir)) return false;
  return ignoredSet(dir, [relPath]).has(relPath);
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node test/lib/gitignore.test.mjs`
Expected: `gitignore.test ok`

- [ ] **Step 4: Commit**

```bash
git add lib/gitignore.mjs test/lib/gitignore.test.mjs
git commit --no-verify -m "feat(scope): lib/gitignore.mjs — filtro git de archivos ignorados (fail-open)"
```

---

## Task 2: `lib/exclude-candidates.mjs` — sugerir dirs a excluir

**Files:**
- Create: `lib/exclude-candidates.mjs`
- Test: `test/lib/exclude-candidates.test.mjs`

**Interfaces:**
- Consumes: nada (solo `fs`).
- Produces: `suggestExcludeDirs(dir: string, config?: { include?: string[], exclude?: string[] }) => string[]` (nombres de dir de primer nivel, ordenados, sin duplicados).

- [ ] **Step 1: Write the failing test** — `test/lib/exclude-candidates.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { suggestExcludeDirs } from '../../lib/exclude-candidates.mjs';

const dir = mkdtempSync(join(tmpdir(), 'exc-'));
mkdirSync(join(dir, '.todo'));
mkdirSync(join(dir, '.claude'));
mkdirSync(join(dir, 'src'));
writeFileSync(join(dir, 'src', 'a.tsx'), '');     // src tiene código -> NO se sugiere
mkdirSync(join(dir, 'assets'));
writeFileSync(join(dir, 'assets', 'logo.png'), ''); // sin código -> se sugiere
mkdirSync(join(dir, 'node_modules'));               // ya excluido -> NO se sugiere

const cfg = { include: ['.tsx', '.ts'], exclude: ['node_modules/'] };
const got = suggestExcludeDirs(dir, cfg);
assert.deepEqual(got, ['.claude', '.todo', 'assets'], `got=${JSON.stringify(got)}`);

// sin config.include no inventa por "falta de código"; solo dot-dirs de tooling conocidos
const got2 = suggestExcludeDirs(dir, { exclude: [] });
assert.ok(got2.includes('.todo') && got2.includes('.claude'), `got2=${JSON.stringify(got2)}`);
assert.ok(!got2.includes('src'), 'src nunca se sugiere');

console.log('exclude-candidates.test ok');
```

Run: `node test/lib/exclude-candidates.test.mjs` → FAIL (module not found).

- [ ] **Step 2: Implement** — `lib/exclude-candidates.mjs`:

```js
// lib/exclude-candidates.mjs
// Sugiere directorios de primer nivel candidatos a excluir de la auditoría:
// dot-dirs de tooling/otros plugins, y dirs sin archivos de código (extensión en config.include).
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const KNOWN_TOOLING = new Set([
  '.todo', '.praxis-guard', '.claude', '.codex', '.github', '.vscode',
  '.opencode', '.husky', '.changeset',
]);
const OBVIOUS_CODE = new Set(['src', 'app', 'components', 'lib', 'pages']);

function dirHasCode(d, include, depth = 2) {
  let entries;
  try { entries = readdirSync(d); } catch { return false; }
  for (const name of entries) {
    const p = join(d, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isFile() && include.includes(extname(name))) return true;
    if (st.isDirectory() && depth > 0 && dirHasCode(p, include, depth - 1)) return true;
  }
  return false;
}

export function suggestExcludeDirs(dir, config = {}) {
  const include = config.include || [];
  const already = new Set((config.exclude || []).map((d) => d.replace(/\/$/, '')));
  let entries;
  try { entries = readdirSync(dir); } catch { return []; }
  const out = [];
  for (const name of entries) {
    if (already.has(name) || OBVIOUS_CODE.has(name)) continue;
    let st;
    try { st = statSync(join(dir, name)); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (KNOWN_TOOLING.has(name)) { out.push(name); continue; }
    if (include.length && !dirHasCode(join(dir, name), include)) out.push(name);
  }
  return out.sort();
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node test/lib/exclude-candidates.test.mjs`
Expected: `exclude-candidates.test ok`

- [ ] **Step 4: Commit**

```bash
git add lib/exclude-candidates.mjs test/lib/exclude-candidates.test.mjs
git commit --no-verify -m "feat(config): sugerir directorios a excluir (lib/exclude-candidates.mjs)"
```

---

## Task 3: Flag `respectGitignore` (defaults + validación)

**Files:**
- Modify: `config/defaults.json` (agregar `respectGitignore`)
- Modify: `lib/validate-config.mjs:24` (aceptar el flag)
- Test: `test/lib/validate-config.test.mjs` (extender) — si no existe, crear el caso mínimo abajo.

**Interfaces:**
- Produces: la config soporta el top-level `respectGitignore` (boolean).

- [ ] **Step 1: Write the failing test** — agregar a `test/lib/validate-config.test.mjs` (o crearlo):

```js
import assert from 'node:assert/strict';
import { validateConfig } from '../../lib/validate-config.mjs';

// respectGitignore boolean -> ok
assert.equal(validateConfig({ respectGitignore: true }).ok, true);
// tipo inválido -> error claro
const bad = validateConfig({ respectGitignore: 'yes' });
assert.equal(bad.ok, false);
assert.ok(bad.errors.some((e) => e.includes('respectGitignore')), `errors=${bad.errors}`);

console.log('validate-config respectGitignore ok');
```

> Si `test/lib/validate-config.test.mjs` ya existe, agregá solo estas 3 assertions antes de su
> `console.log` final (no dupliques el import).

Run: `node test/lib/validate-config.test.mjs` → FAIL (acepta el string o no valida).

- [ ] **Step 2: Implement (defaults)** — en `config/defaults.json`, agregar el flag tras `"exclude"` (línea 3):

```json
  "exclude": ["node_modules/", ".next/", "dist/", "build/", ".git/", "coverage/"],
  "respectGitignore": false,
```

- [ ] **Step 3: Implement (validación)** — en `lib/validate-config.mjs`, tras la línea de `exclude` (línea 24), agregar:

```js
  if ('respectGitignore' in obj && typeof obj.respectGitignore !== 'boolean') errors.push('respectGitignore debe ser boolean');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/lib/validate-config.test.mjs`
Expected: PASS (incluye `respectGitignore`).

- [ ] **Step 5: Commit**

```bash
git add config/defaults.json lib/validate-config.mjs test/lib/validate-config.test.mjs
git commit --no-verify -m "feat(config): flag respectGitignore (default false) + validación"
```

---

## Task 4: Integrar gitignore en el auditor (`lib/walk.mjs`)

**Files:**
- Modify: `lib/walk.mjs` (`enumerateFiles`)
- Test: `test/lib/walk-gitignore.test.mjs`

**Interfaces:**
- Consumes: `filterGitIgnored` (Task 1), `config.respectGitignore` (Task 3).

- [ ] **Step 1: Write the failing test** — `test/lib/walk-gitignore.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { enumerateFiles } from '../../lib/walk.mjs';

const repo = mkdtempSync(join(tmpdir(), 'walk-gi-'));
execFileSync('git', ['-C', repo, 'init', '-q']);
writeFileSync(join(repo, '.gitignore'), 'generated/\n');
mkdirSync(join(repo, 'src'), { recursive: true });
mkdirSync(join(repo, 'generated'), { recursive: true });
writeFileSync(join(repo, 'src', 'a.ts'), '');
writeFileSync(join(repo, 'generated', 'b.ts'), '');

const cfg = { include: ['.ts'], exclude: [] };
// sin respectGitignore -> ve los dos (comportamiento actual intacto)
const all = enumerateFiles(repo, { ...cfg, respectGitignore: false });
assert.ok(all.includes('generated/b.ts'), 'sin flag, incluye el ignorado');
// con respectGitignore -> excluye generated/b.ts
const kept = enumerateFiles(repo, { ...cfg, respectGitignore: true });
assert.ok(kept.includes('src/a.ts') && !kept.includes('generated/b.ts'), `kept=${JSON.stringify(kept)}`);

console.log('walk-gitignore.test ok');
```

Run: `node test/lib/walk-gitignore.test.mjs` → FAIL (ambos incluyen el ignorado).

- [ ] **Step 2: Implement** — en `lib/walk.mjs`, agregar el import arriba y filtrar al final de `enumerateFiles`:

```js
import { filterGitIgnored } from './gitignore.mjs';
```

Reemplazar `return out.sort();` (última línea de `enumerateFiles`) por:

```js
  const sorted = out.sort();
  return config.respectGitignore ? filterGitIgnored(root, sorted) : sorted;
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node test/lib/walk-gitignore.test.mjs`
Expected: `walk-gitignore.test ok`

- [ ] **Step 4: Suite + commit**

```bash
node test/run.mjs   # verde
git add lib/walk.mjs test/lib/walk-gitignore.test.mjs
git commit --no-verify -m "feat(scope): el auditor respeta .gitignore cuando respectGitignore"
```

---

## Task 5: Integrar gitignore en el hook (`hooks/detect.mjs`)

**Files:**
- Modify: `hooks/detect.mjs` (`runDetector`)
- Test: `test/hooks/detect-gitignore.test.mjs`

**Interfaces:**
- Consumes: `isGitIgnored` (Task 1), `config.respectGitignore` (Task 3).
- Produces: `runDetector(filePath, { content?, config?, customFileRules?, cwd? })` — nuevo opcional `cwd` (default `process.cwd()`) usado para el chequeo gitignore.

- [ ] **Step 1: Write the failing test** — `test/hooks/detect-gitignore.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runDetector } from '../../hooks/detect.mjs';

const repo = mkdtempSync(join(tmpdir(), 'detect-gi-'));
execFileSync('git', ['-C', repo, 'init', '-q']);
writeFileSync(join(repo, '.gitignore'), 'generated/\n');
mkdirSync(join(repo, 'generated'), { recursive: true });
// archivo con una mala praxis obvia (secret) que normalmente dispara findings
const bad = 'const k = "sk_live_ABCDEFGHIJKLMNOP";\n';
writeFileSync(join(repo, 'generated', 'leak.ts'), bad);

const cfg = { include: ['.ts'], exclude: [], rules: { secrets: { enabled: true } }, detected: { typescript: false, tailwind: false } };

// sin respectGitignore -> detecta el secret
const on = runDetector('generated/leak.ts', { content: bad, config: { ...cfg, respectGitignore: false }, cwd: repo });
assert.ok(on.findings.length > 0, 'sin flag, detecta');
// con respectGitignore -> el archivo está ignorado -> sin findings
const off = runDetector('generated/leak.ts', { content: bad, config: { ...cfg, respectGitignore: true }, cwd: repo });
assert.equal(off.findings.length, 0, 'archivo ignorado por git -> no audita');

console.log('detect-gitignore.test ok');
```

Run: `node test/hooks/detect-gitignore.test.mjs` → FAIL (detecta en ambos casos).

- [ ] **Step 2: Implement** — en `hooks/detect.mjs`:

Agregar el import (tras la línea 8):

```js
import { isGitIgnored } from '../lib/gitignore.mjs';
```

Cambiar la firma y el chequeo. Reemplazar las líneas 11-16 actuales:

```js
export function runDetector(filePath, { content, config, customFileRules } = {}) {
  const cfg = config || loadConfig({ projectConfigPath: defaultProjectConfigPath() });
  if (!cfg.detected) {
    try { cfg.detected = detectStack(process.cwd()); } catch { cfg.detected = { typescript: false, tailwind: false, tsconfigOptions: null, tsconfigFixable: false }; }
  }
  if (!isInScope(filePath, cfg)) return { findings: [], text: '' };
```

por:

```js
export function runDetector(filePath, { content, config, customFileRules, cwd = process.cwd() } = {}) {
  const cfg = config || loadConfig({ projectConfigPath: defaultProjectConfigPath() });
  if (!cfg.detected) {
    try { cfg.detected = detectStack(cwd); } catch { cfg.detected = { typescript: false, tailwind: false, tsconfigOptions: null, tsconfigFixable: false }; }
  }
  if (!isInScope(filePath, cfg)) return { findings: [], text: '' };
  if (cfg.respectGitignore && isGitIgnored(cwd, filePath)) return { findings: [], text: '' };
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node test/hooks/detect-gitignore.test.mjs`
Expected: `detect-gitignore.test ok`

- [ ] **Step 4: Suite + commit**

```bash
node test/run.mjs   # verde
git add hooks/detect.mjs test/hooks/detect-gitignore.test.mjs
git commit --no-verify -m "feat(scope): el hook saltea archivos git-ignored cuando respectGitignore"
```

---

## Task 6: `praxis-config suggest-excludes` + skill

**Files:**
- Modify: `bin/praxis-config.mjs` (nuevo comando `suggest-excludes`)
- Modify: `skills/praxis-config/SKILL.md` (paso nuevo)
- Test: `test/bin/praxis-config-suggest.test.mjs`

**Interfaces:**
- Consumes: `suggestExcludeDirs` (Task 2).
- Produces: `node bin/praxis-config.mjs suggest-excludes --dir <d>` imprime `{ "candidates": [...] }` (JSON).

- [ ] **Step 1: Write the failing test** — `test/bin/praxis-config-suggest.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const BIN = resolve('bin/praxis-config.mjs');
const dir = mkdtempSync(join(tmpdir(), 'pc-sug-'));
mkdirSync(join(dir, '.todo'));
mkdirSync(join(dir, 'src'));
writeFileSync(join(dir, 'src', 'a.tsx'), '');

const out = execFileSync('node', [BIN, 'suggest-excludes', '--dir', dir], { encoding: 'utf8' });
const parsed = JSON.parse(out);
assert.ok(Array.isArray(parsed.candidates), 'candidates es array');
assert.ok(parsed.candidates.includes('.todo'), `candidates=${JSON.stringify(parsed.candidates)}`);
assert.ok(!parsed.candidates.includes('src'), 'src no se sugiere');

console.log('praxis-config-suggest.test ok');
```

Run: `node test/bin/praxis-config-suggest.test.mjs` → FAIL (comando desconocido / no imprime JSON).

- [ ] **Step 2: Implement (bin)** — en `bin/praxis-config.mjs`:

Agregar el import (tras la línea 16):

```js
import { suggestExcludeDirs } from '../lib/exclude-candidates.mjs';
```

Agregar el comando antes del bloque `if (cmd === 'write')` (es decir, tras el bloque `show`, línea 65):

```js
if (cmd === 'suggest-excludes') {
  const cfg = loadConfig({ projectConfigPath: defaultProjectConfigPath(dir) });
  const candidates = suggestExcludeDirs(dir, cfg);
  process.stdout.write(JSON.stringify({ candidates }, null, 2) + '\n');
  process.exit(0);
}
```

Actualizar la línea de uso final:

```js
console.error('uso: node bin/praxis-config.mjs <show|write|suggest-excludes> [--dir <proyecto>]');
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node test/bin/praxis-config-suggest.test.mjs`
Expected: `praxis-config-suggest.test ok`

- [ ] **Step 4: Update skill** — en `skills/praxis-config/SKILL.md`, insertar un paso nuevo entre el paso 1 (Leé el estado) y el paso 2 (Preguntá). Texto a insertar:

```markdown
1.5. **Alcance de archivos (gitignore + directorios a excluir):**
   - Preguntá: **"¿Respetar el `.gitignore`? (no audita lo que git ignora — recomendado)"**.
     Si sí, seteá `respectGitignore: true` en el objeto config (default es `false`).
   - Corré `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-config.mjs suggest-excludes --dir <raíz>` y leé
     `candidates`. Presentalos como **checklist** ("¿cuáles de estos NO querés auditar?") y ofrecé
     además **texto libre** para agregar nombres a mano (p. ej. dirs de otros plugins que el detector
     no pescó). Mergeá lo elegido en `config.exclude` (sin pisar lo previo, sin duplicados).
```

- [ ] **Step 5: Suite + commit**

```bash
node test/run.mjs   # verde
git add bin/praxis-config.mjs skills/praxis-config/SKILL.md test/bin/praxis-config-suggest.test.mjs
git commit --no-verify -m "feat(config): praxis-config pregunta gitignore + excluir dirs (suggest-excludes)"
```

---

## Task 7: Docs (README + AGENTS)

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: README — `respectGitignore`** — en la sección **Configuración**, en la tabla "Knobs **globales**" (`## Referencia de valores`), agregar una fila tras `exclude`:

```markdown
| `respectGitignore` | `true\|false` — no audita los archivos que git ignora (hook + auditor; fail-open si no es repo git) | `false` |
```

- [ ] **Step 2: README — separación + praxis-config** — al final de la sección **Configuración** (antes de `### Referencia de valores`), agregar un párrafo:

```markdown
**Qué archivos se auditan.** Dos filtros recortan el universo: `exclude` (por **nombre de directorio**:
código tuyo que no querés auditar, p. ej. dirs de otros plugins) y `respectGitignore` (los archivos que
**git ignora**: build, deps, secretos). La skill `praxis-config` te pregunta por ambos — ofrece activar
el respeto al `.gitignore` y un checklist de directorios candidatos a excluir (más texto libre).
```

- [ ] **Step 3: AGENTS.md** — en la sección de configuración (tras el párrafo de `praxis-config`), agregar:

```markdown
El alcance de archivos se recorta con `exclude` (por nombre de directorio) y `respectGitignore`
(default `false`; si se activa, hook y auditor saltean lo que git ignora, vía `git check-ignore`,
fail-open). `praxis-config` pregunta por ambos (incluido un checklist de directorios candidatos).
```

- [ ] **Step 4: Commit**

```bash
node test/run.mjs   # verde (sanidad)
git add README.md AGENTS.md
git commit --no-verify -m "docs: respectGitignore + exclusión guiada de directorios"
```

---

## Self-review (cobertura del spec)

- **§A.1 `lib/gitignore.mjs` (filter + check, fail-open)** → Task 1. ✅
- **§A.2 flag `respectGitignore` default false + validación** → Task 3. ✅
- **§A.3 integración auditor** → Task 4; **hook** → Task 5. ✅
- **§B.1 `lib/exclude-candidates.mjs`** → Task 2. ✅
- **§B.2 `suggest-excludes` + skill (checklist + texto libre)** → Task 6. ✅
- **§C validación** → Task 3. ✅
- **§D tests** → Tasks 1,2,3,4,5,6. ✅
- **§E docs** → Task 7. ✅

Firmas consistentes: `filterGitIgnored(dir, relPaths)`/`isGitIgnored(dir, relPath)` (Task 1) usadas por `enumerateFiles` (Task 4) y `runDetector` (Task 5, con el nuevo opcional `cwd`). `suggestExcludeDirs(dir, config)` (Task 2) usada por el comando `suggest-excludes` (Task 6). Sin placeholders.
