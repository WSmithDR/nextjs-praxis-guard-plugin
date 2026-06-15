# Reglas TypeScript + Tailwind (Fase 1) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar dos grupos de reglas heurísticas (TS de aprovechamiento de tipos + Tailwind) con autodetección de stack, más un fixer opt-in de `tsconfig`.

**Architecture:** Un helper `lib/detect-stack.mjs` detecta TS/Tailwind y se inyecta en `config.detected` desde los orquestadores (`hooks/detect.mjs`, `bin/praxis-audit.mjs`). Las reglas son funciones puras que leen `fullConfig.detected` y gatean por stack + extensión. El fixer de tsconfig vive en `lib/tsconfig-fix.mjs` y se expone con `praxis-audit --fix-tsconfig`.

**Tech Stack:** Node ≥18, ESM `.mjs`, zero-dep. Tests = scripts `.mjs` con `node:assert/strict`, corridos por `test/run.mjs`. Correr todo: `npm test`. Correr uno: `node test/ruta/al.test.mjs`.

**Spec:** `docs/specs/2026-06-15-typescript-tailwind-rules-design.md`

**Patrones del repo (clavar exacto):**
- File rule: `export default function rule(content, filePath, config = {}, full = {}) { … }` → `Finding[]`.
  `Finding = { rule, line?, severity: 'info'|'warn', message }`.
- Project rule: `export default function rule(tree, full = {}) { … }` → `Finding[]` (puede llevar `file`).
- `rules/index.mjs` exporta `RULES` (file) y `PROJECT_RULES` (project).
- `runDetector` (en `hooks/detect.mjs`) saltea reglas con `config.enabled === false` y pasa
  `fn(src, filePath, ruleCfg, cfg)`.
- Helpers existentes reutilizables: `lib/imports.mjs` (`extractImports`), `lib/glob.mjs` (`matchGlob`).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/detect-stack.mjs` (new) | `detectStack(root)` → `{ typescript, tailwind, tsconfigPath, tsconfigOptions, tsconfigFixable }` |
| `lib/tsconfig-fix.mjs` (new) | `computeMissing(options, baseline)`, `applyFix(path, missing)` |
| `rules/repeated-object-shape.mjs` (new) | file rule TS |
| `rules/stringly-typed.mjs` (new) | file rule TS |
| `rules/duplicate-literal-union.mjs` (new) | file rule TS |
| `rules/prefer-as-const.mjs` (new) | file rule TS |
| `rules/tsconfig-strictness.mjs` (new) | project rule TS |
| `rules/tailwind-arbitrary-values.mjs` (new) | file rule Tailwind |
| `rules/tailwind-classname-bloat.mjs` (new) | file rule Tailwind |
| `rules/tailwind-conditional-concat.mjs` (new) | file rule Tailwind |
| `rules/tailwind-duplicate-utilities.mjs` (new) | file rule Tailwind |
| `lib/classname.mjs` (new) | `extractClassNames(content)` → `[{ value, line }]` (compartido por las Tailwind) |
| `rules/index.mjs` (mod) | registrar 8 file rules + 1 project rule |
| `hooks/detect.mjs` (mod) | inyectar `cfg.detected` |
| `bin/praxis-audit.mjs` (mod) | inyectar `config.detected` + flag `--fix-tsconfig` |
| `lib/validate-config.mjs` (mod) | ids + params nuevos |
| `config/defaults.json` (mod) | + 9 reglas |
| docs/skills (mod) | documentar |

---

## Task 1: `lib/detect-stack.mjs`

**Files:**
- Create: `lib/detect-stack.mjs`
- Test: `test/lib/detect-stack.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/lib/detect-stack.test.mjs`:

```js
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack } from '../../lib/detect-stack.mjs';
import assert from 'node:assert/strict';

function tmp() { return mkdtempSync(join(tmpdir(), 'praxis-detect-')); }

// sin nada
{
  const d = tmp();
  const r = detectStack(d);
  assert.equal(r.typescript, false);
  assert.equal(r.tailwind, false);
  assert.equal(r.tsconfigOptions, null);
  rmSync(d, { recursive: true, force: true });
}
// tsconfig limpio + tailwind
{
  const d = tmp();
  writeFileSync(join(d, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
  writeFileSync(join(d, 'tailwind.config.js'), 'module.exports = {};');
  const r = detectStack(d);
  assert.equal(r.typescript, true);
  assert.equal(r.tailwind, true);
  assert.equal(r.tsconfigOptions.strict, true);
  assert.equal(r.tsconfigFixable, true);
  rmSync(d, { recursive: true, force: true });
}
// tsconfig JSONC (comentarios) -> parsea pero NO fixable
{
  const d = tmp();
  writeFileSync(join(d, 'tsconfig.json'), '{\n  // comentario\n  "compilerOptions": { "strict": false }\n}');
  const r = detectStack(d);
  assert.equal(r.typescript, true);
  assert.equal(r.tsconfigOptions.strict, false);
  assert.equal(r.tsconfigFixable, false);
  rmSync(d, { recursive: true, force: true });
}
// tsconfig con extends -> no fixable
{
  const d = tmp();
  writeFileSync(join(d, 'tsconfig.json'), JSON.stringify({ extends: './base.json', compilerOptions: {} }));
  const r = detectStack(d);
  assert.equal(r.tsconfigFixable, false);
  rmSync(d, { recursive: true, force: true });
}
console.log('detect-stack.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/detect-stack.test.mjs`

- [ ] **Step 3: Implementar `lib/detect-stack.mjs`**

```js
// lib/detect-stack.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TAILWIND_CONFIGS = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];

function stripJsonComments(s) {
  // quita /* */ y // (suficiente para tsconfig; no maneja // dentro de strings, raro en tsconfig)
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function detectStack(root) {
  const tsconfigPath = join(root, 'tsconfig.json');
  const hasTs = existsSync(tsconfigPath);
  const tailwind = TAILWIND_CONFIGS.some((f) => existsSync(join(root, f)));

  let tsconfigOptions = null;
  let tsconfigFixable = false;
  if (hasTs) {
    let raw = '';
    try { raw = readFileSync(tsconfigPath, 'utf8'); } catch { raw = ''; }
    const hasComments = /\/\*[\s\S]*?\*\/|(^|[^:])\/\//.test(raw);
    let parsed = null;
    try { parsed = JSON.parse(raw); }
    catch { try { parsed = JSON.parse(stripJsonComments(raw)); } catch { parsed = null; } }
    if (parsed && typeof parsed === 'object') {
      tsconfigOptions = (parsed.compilerOptions && typeof parsed.compilerOptions === 'object') ? parsed.compilerOptions : {};
      tsconfigFixable = !hasComments && !('extends' in parsed);
    }
  }

  return {
    typescript: hasTs,
    tailwind,
    tsconfigPath: hasTs ? tsconfigPath : null,
    tsconfigOptions,
    tsconfigFixable,
  };
}
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/lib/detect-stack.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add lib/detect-stack.mjs test/lib/detect-stack.test.mjs
git commit -m "feat(lib): detect-stack (typescript/tailwind + parseo tolerante de tsconfig)"
```

---

## Task 2: Inyectar `detected` en los orquestadores

`runDetector` y `praxis-audit` deben poner `detectStack(root)` en `config.detected` para que las reglas lo lean. Sin esto las reglas de Tasks 4-12 nunca corren.

**Files:**
- Modify: `hooks/detect.mjs`
- Modify: `bin/praxis-audit.mjs`
- Test: `test/detect-injects-stack.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/detect-injects-stack.test.mjs`:

```js
import { runDetector } from '../hooks/detect.mjs';
import assert from 'node:assert/strict';

// Una regla de prueba que reporta lo que ve en full.detected.
// Reusamos una regla real luego; acá validamos el plumbing con un config inline.
const cfg = {
  include: ['.ts', '.tsx'], exclude: [],
  detected: undefined,
  rules: {},
};
// runDetector debe ASIGNAR cfg.detected si no vino (desde el cwd del proceso).
const { } = runDetector('noexiste.ts', { content: 'const a = 1;', config: cfg });
assert.ok(cfg.detected && typeof cfg.detected === 'object', 'runDetector inyecta detected');
assert.ok('typescript' in cfg.detected && 'tailwind' in cfg.detected);
console.log('detect-injects-stack.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/detect-injects-stack.test.mjs`

- [ ] **Step 3: Modificar `hooks/detect.mjs`**

Agregar import arriba:

```js
import { detectStack } from '../lib/detect-stack.mjs';
```

Dentro de `runDetector`, después de la línea `const cfg = config || loadConfig({...});` y ANTES
del chequeo `if (!isInScope(...))`, agregar:

```js
  if (!cfg.detected) {
    try { cfg.detected = detectStack(process.cwd()); } catch { cfg.detected = { typescript: false, tailwind: false, tsconfigOptions: null, tsconfigFixable: false }; }
  }
```

- [ ] **Step 4: Modificar `bin/praxis-audit.mjs`**

Agregar import arriba (junto a los otros):

```js
import { detectStack } from '../lib/detect-stack.mjs';
```

Después de la línea `const config = loadConfig({ projectConfigPath: defaultProjectConfigPath(dir) });`
agregar:

```js
try { config.detected = detectStack(dir); } catch { config.detected = { typescript: false, tailwind: false, tsconfigOptions: null, tsconfigFixable: false }; }
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/detect-injects-stack.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add hooks/detect.mjs bin/praxis-audit.mjs test/detect-injects-stack.test.mjs
git commit -m "feat(detect): inyectar config.detected (stack) en hook y auditoría"
```

---

## Task 3: Config defaults + validación de las 9 reglas

**Files:**
- Modify: `config/defaults.json`
- Modify: `lib/validate-config.mjs`
- Test: `test/lib/validate-config.test.mjs` (append)

- [ ] **Step 1: Añadir casos al test (fallan)**

Append a `test/lib/validate-config.test.mjs`, antes del `console.log('validate-config.test ok')` final:

```js
// --- reglas TS + Tailwind ---
{
  const ok = validateConfig({ rules: {
    'repeated-object-shape': { enabled: true, minProps: 2, minRepeats: 2 },
    'stringly-typed': { enabled: true, minLiterals: 2 },
    'duplicate-literal-union': { enabled: true, minMembers: 2, minRepeats: 2 },
    'prefer-as-const': { enabled: false },
    'tsconfig-strictness': { enabled: true, baseline: ['strict', 'noImplicitAny'] },
    'tailwind-arbitrary-values': { enabled: true, allow: ['grid-cols-'] },
    'tailwind-classname-bloat': { enabled: true, maxClasses: 12 },
    'tailwind-conditional-concat': { enabled: true },
    'tailwind-duplicate-utilities': { enabled: true },
  }});
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
}
assert.equal(validateConfig({ rules: { 'tsconfig-strictness': { baseline: 'strict' } } }).ok, false);
assert.equal(validateConfig({ rules: { 'tailwind-classname-bloat': { maxClasses: '12' } } }).ok, false);
assert.equal(validateConfig({ rules: { 'tailwind-arbitrary-values': { allow: 'x' } } }).ok, false);
console.log('validate-config ts/tailwind cases ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/validate-config.test.mjs`

- [ ] **Step 3: Modificar `lib/validate-config.mjs`**

Reemplazar la constante `KNOWN_RULES` por (agregando los 9 ids al final del array existente):

```js
const KNOWN_RULES = ['secrets', 'hardcoded-data', 'forbidden-imports', 'file-responsibility', 'untranslated-text',
  'folder-placement', 'architecture-coherence', 'layer-boundaries', 'server-client-boundaries', 'feature-deps',
  'repeated-object-shape', 'stringly-typed', 'duplicate-literal-union', 'prefer-as-const', 'tsconfig-strictness',
  'tailwind-arbitrary-values', 'tailwind-classname-bloat', 'tailwind-conditional-concat', 'tailwind-duplicate-utilities'];
```

Agregar `minLiterals`, `minMembers`, `maxClasses` a la lista `NUMERIC_KEYS`:

```js
const NUMERIC_KEYS = ['maxLines', 'mixedSignalsLines', 'minElements', 'minProps', 'minRepeats', 'minLiterals', 'minMembers', 'maxClasses'];
```

Dentro del loop `for (const [id, rule] of Object.entries(obj.rules))`, después del bloque de
`feature-deps` (el último que agregamos), añadir:

```js
        if (id === 'tsconfig-strictness' && 'baseline' in rule && !isStringArray(rule.baseline)) {
          errors.push('rules.tsconfig-strictness.baseline debe ser array de strings');
        }
        if (id === 'tailwind-arbitrary-values' && 'allow' in rule && !isStringArray(rule.allow)) {
          errors.push('rules.tailwind-arbitrary-values.allow debe ser array de strings');
        }
```

> `minProps`/`minRepeats`/`minLiterals`/`minMembers`/`maxClasses` ya quedan validados como número
> por el loop existente de `NUMERIC_KEYS`.

- [ ] **Step 4: Modificar `config/defaults.json`**

Dentro de `"rules"`, después de `"feature-deps"`, agregar:

```json
    "repeated-object-shape": { "enabled": true, "minProps": 2, "minRepeats": 2 },
    "stringly-typed": { "enabled": true, "minLiterals": 2 },
    "duplicate-literal-union": { "enabled": true, "minMembers": 2, "minRepeats": 2 },
    "prefer-as-const": { "enabled": true },
    "tsconfig-strictness": { "enabled": true, "baseline": ["strict", "noImplicitAny"] },
    "tailwind-arbitrary-values": { "enabled": true, "allow": [] },
    "tailwind-classname-bloat": { "enabled": true, "maxClasses": 12 },
    "tailwind-conditional-concat": { "enabled": true },
    "tailwind-duplicate-utilities": { "enabled": true }
```

(Acordate de poner la coma después de la entrada `"feature-deps": {...}` anterior.)

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/lib/validate-config.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add config/defaults.json lib/validate-config.mjs test/lib/validate-config.test.mjs
git commit -m "feat(config): registrar 9 reglas TS/Tailwind (gated por detección)"
```

---

## Task 4: Regla `repeated-object-shape`

**Files:**
- Create: `rules/repeated-object-shape.mjs`
- Test: `test/rules/repeated-object-shape.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/repeated-object-shape.test.mjs`:

```js
import rule from '../../rules/repeated-object-shape.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, minProps: 2, minRepeats: 2 };
const full = { detected: { typescript: true } };

// mismo shape 2 veces (orden distinto de claves => normaliza) -> finding
const bad = [
  'function a(x: { id: string; name: string }) {}',
  'function b(y: { name: string; id: string }) {}',
].join('\n');
const out = rule(bad, 'a.ts', cfg, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'repeated-object-shape');

// shape único -> 0
assert.equal(rule('function a(x: { id: string; name: string }) {}', 'a.ts', cfg, full).length, 0);

// gating: archivo .js -> 0
assert.equal(rule(bad, 'a.js', cfg, full).length, 0);
// gating: sin TS detectado -> 0
assert.equal(rule(bad, 'a.ts', cfg, { detected: { typescript: false } }).length, 0);
console.log('repeated-object-shape.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/repeated-object-shape.test.mjs`

- [ ] **Step 3: Implementar `rules/repeated-object-shape.mjs`**

```js
// rules/repeated-object-shape.mjs
// File rule (TS): mismo shape de objeto literal repetido -> extraé a interface/type.
const SHAPE_RE = /\{\s*([a-zA-Z_$][\w$]*\s*\??\s*:[^{}]+?)\}/g;

function isTsFile(p) { return /\.tsx?$/.test(String(p)); }

function normalizeShape(inner) {
  const props = inner.split(';').map((s) => s.trim()).filter(Boolean);
  if (props.length < 2) return null;
  // normaliza: nombre:tipo con espacios colapsados, ordenado por nombre de prop
  const norm = props.map((p) => p.replace(/\s+/g, ' ').replace(/\s*:\s*/, ':')).sort();
  return { key: norm.join(';'), count: norm.length };
}

export default function repeatedObjectShape(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.typescript) || !isTsFile(filePath)) return [];
  const minProps = config.minProps ?? 2;
  const minRepeats = config.minRepeats ?? 2;

  const seen = new Map();   // key -> { count, line }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let m;
    const re = new RegExp(SHAPE_RE.source, 'g');
    while ((m = re.exec(lines[i])) !== null) {
      const norm = normalizeShape(m[1]);
      if (!norm || norm.count < minProps) continue;
      const prev = seen.get(norm.key) || { count: 0, line: i + 1 };
      prev.count += 1;
      seen.set(norm.key, prev);
    }
  }
  const out = [];
  for (const [, v] of seen) {
    if (v.count >= minRepeats) {
      out.push({ rule: 'repeated-object-shape', line: v.line, severity: 'info',
        message: `Shape de objeto repetido ${v.count} veces. Extraé a una interface/type reutilizable.` });
    }
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`**

```js
import repeatedObjectShape from './repeated-object-shape.mjs';
```
en `RULES`, después de `feature-deps`:
```js
  'repeated-object-shape': repeatedObjectShape,
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/repeated-object-shape.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/repeated-object-shape.mjs rules/index.mjs test/rules/repeated-object-shape.test.mjs
git commit -m "feat(rules): repeated-object-shape (reuso de tipos)"
```

---

## Task 5: Regla `stringly-typed`

**Files:**
- Create: `rules/stringly-typed.mjs`
- Test: `test/rules/stringly-typed.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/stringly-typed.test.mjs`:

```js
import rule from '../../rules/stringly-typed.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, minLiterals: 2 };
const full = { detected: { typescript: true } };

// mismo id comparado contra 2 strings -> finding
const bad = "if (status === 'active' || status === 'pending') {}";
const out = rule(bad, 'a.ts', cfg, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'stringly-typed');
assert.equal(out[0].line, 1);

// una sola comparación -> 0
assert.equal(rule("if (status === 'active') {}", 'a.ts', cfg, full).length, 0);
// gating .js -> 0
assert.equal(rule(bad, 'a.js', cfg, full).length, 0);
console.log('stringly-typed.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/stringly-typed.test.mjs`

- [ ] **Step 3: Implementar `rules/stringly-typed.mjs`**

```js
// rules/stringly-typed.mjs
// File rule (TS): un id comparado contra varios string literals -> union type / enum.
const CMP_RE = /([a-zA-Z_$][\w$.]*)\s*===?\s*['"]([^'"]+)['"]/g;

function isTsFile(p) { return /\.tsx?$/.test(String(p)); }

export default function stringlyTyped(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.typescript) || !isTsFile(filePath)) return [];
  const minLiterals = config.minLiterals ?? 2;

  const out = [];
  const lines = content.split('\n');
  // acumulador por id -> Set de literales + primera línea
  const byId = new Map();
  for (let i = 0; i < lines.length; i++) {
    let m;
    const re = new RegExp(CMP_RE.source, 'g');
    while ((m = re.exec(lines[i])) !== null) {
      const id = m[1], lit = m[2];
      const e = byId.get(id) || { lits: new Set(), line: i + 1 };
      e.lits.add(lit);
      byId.set(id, e);
    }
  }
  for (const [id, e] of byId) {
    if (e.lits.size >= minLiterals) {
      out.push({ rule: 'stringly-typed', line: e.line, severity: 'info',
        message: `"${id}" se compara contra varios strings fijos. Considerá un union type ('a' | 'b') o un enum.` });
    }
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`**

```js
import stringlyTyped from './stringly-typed.mjs';
```
en `RULES`:
```js
  'stringly-typed': stringlyTyped,
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/stringly-typed.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/stringly-typed.mjs rules/index.mjs test/rules/stringly-typed.test.mjs
git commit -m "feat(rules): stringly-typed (union/enum sobre strings sueltos)"
```

---

## Task 6: Regla `duplicate-literal-union`

**Files:**
- Create: `rules/duplicate-literal-union.mjs`
- Test: `test/rules/duplicate-literal-union.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/duplicate-literal-union.test.mjs`:

```js
import rule from '../../rules/duplicate-literal-union.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, minMembers: 2, minRepeats: 2 };
const full = { detected: { typescript: true } };

// misma union 2 veces (orden distinto => normaliza) -> finding
const bad = [
  "function a(x: 'sm' | 'md' | 'lg') {}",
  "let y: 'lg' | 'md' | 'sm';",
].join('\n');
const out = rule(bad, 'a.ts', cfg, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'duplicate-literal-union');

// union única -> 0
assert.equal(rule("function a(x: 'sm' | 'md') {}", 'a.ts', cfg, full).length, 0);
// gating sin TS -> 0
assert.equal(rule(bad, 'a.ts', cfg, { detected: { typescript: false } }).length, 0);
console.log('duplicate-literal-union.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/duplicate-literal-union.test.mjs`

- [ ] **Step 3: Implementar `rules/duplicate-literal-union.mjs`**

```js
// rules/duplicate-literal-union.mjs
// File rule (TS): la misma union de literales escrita varias veces -> nombrala.
// Captura secuencias 'lit' | 'lit' | ... (>=2 miembros string).
const UNION_RE = /(['"][^'"]+['"](?:\s*\|\s*['"][^'"]+['"])+)/g;

function isTsFile(p) { return /\.tsx?$/.test(String(p)); }

function normalizeUnion(text) {
  const members = text.split('|').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const uniq = [...new Set(members)].sort();
  return { key: uniq.join('|'), count: uniq.length };
}

export default function duplicateLiteralUnion(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.typescript) || !isTsFile(filePath)) return [];
  const minMembers = config.minMembers ?? 2;
  const minRepeats = config.minRepeats ?? 2;

  const seen = new Map();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let m;
    const re = new RegExp(UNION_RE.source, 'g');
    while ((m = re.exec(lines[i])) !== null) {
      const norm = normalizeUnion(m[1]);
      if (norm.count < minMembers) continue;
      const prev = seen.get(norm.key) || { count: 0, line: i + 1 };
      prev.count += 1;
      seen.set(norm.key, prev);
    }
  }
  const out = [];
  for (const [, v] of seen) {
    if (v.count >= minRepeats) {
      out.push({ rule: 'duplicate-literal-union', line: v.line, severity: 'info',
        message: `Union de literales repetida. Declarala una vez como type y reusala.` });
    }
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`**

```js
import duplicateLiteralUnion from './duplicate-literal-union.mjs';
```
en `RULES`:
```js
  'duplicate-literal-union': duplicateLiteralUnion,
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/duplicate-literal-union.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/duplicate-literal-union.mjs rules/index.mjs test/rules/duplicate-literal-union.test.mjs
git commit -m "feat(rules): duplicate-literal-union (reuso de tipos)"
```

---

## Task 7: Regla `prefer-as-const`

**Files:**
- Create: `rules/prefer-as-const.mjs`
- Test: `test/rules/prefer-as-const.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/prefer-as-const.test.mjs`:

```js
import rule from '../../rules/prefer-as-const.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };
const full = { detected: { typescript: true } };

// objeto de constantes en MAYÚSCULAS sin as const -> finding
const bad = "const STATUS = { ACTIVE: 'active', PENDING: 'pending' };";
const out = rule(bad, 'a.ts', cfg, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'prefer-as-const');

// con as const -> 0
assert.equal(rule("const STATUS = { ACTIVE: 'active' } as const;", 'a.ts', cfg, full).length, 0);
// objeto normal en minúscula (no mapa de constantes) -> 0
assert.equal(rule("const config = { url: 'x' };", 'a.ts', cfg, full).length, 0);
console.log('prefer-as-const.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/prefer-as-const.test.mjs`

- [ ] **Step 3: Implementar `rules/prefer-as-const.mjs`**

```js
// rules/prefer-as-const.mjs
// File rule (TS): objeto-mapa de constantes (nombre en MAYÚSCULAS/PascalCase) sin `as const`.
// Solo valores primitivos (string/number/bool). Heurística por línea de declaración.
const DECL_RE = /\bconst\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\{([^{}]*)\}\s*(as\s+const)?/;
const PRIMITIVE_VAL = /:\s*(['"][^'"]*['"]|-?\d+(\.\d+)?|true|false)\s*$/;

function isTsFile(p) { return /\.tsx?$/.test(String(p)); }

export default function preferAsConst(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.typescript) || !isTsFile(filePath)) return [];

  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = DECL_RE.exec(lines[i]);
    if (!m) continue;
    if (m[3]) continue;                        // ya tiene `as const`
    const body = m[2].trim();
    if (!body) continue;
    const entries = body.split(',').map((s) => s.trim()).filter(Boolean);
    if (entries.length === 0) continue;
    const allPrimitive = entries.every((e) => PRIMITIVE_VAL.test(e));
    if (!allPrimitive) continue;
    out.push({ rule: 'prefer-as-const', line: i + 1, severity: 'info',
      message: `Objeto de constantes "${m[1]}" sin "as const": perdés el narrowing de tipos. Agregá "as const".` });
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`**

```js
import preferAsConst from './prefer-as-const.mjs';
```
en `RULES`:
```js
  'prefer-as-const': preferAsConst,
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/prefer-as-const.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/prefer-as-const.mjs rules/index.mjs test/rules/prefer-as-const.test.mjs
git commit -m "feat(rules): prefer-as-const (const assertions)"
```

---

## Task 8: `lib/tsconfig-fix.mjs` + regla `tsconfig-strictness`

**Files:**
- Create: `lib/tsconfig-fix.mjs`
- Create: `rules/tsconfig-strictness.mjs`
- Modify: `rules/index.mjs` (`PROJECT_RULES`)
- Test: `test/lib/tsconfig-fix.test.mjs`, `test/rules/tsconfig-strictness.test.mjs`

- [ ] **Step 1: Test de tsconfig-fix (falla)**

Create `test/lib/tsconfig-fix.test.mjs`:

```js
import { computeMissing } from '../../lib/tsconfig-fix.mjs';
import assert from 'node:assert/strict';

// faltan / están en false -> se reportan
assert.deepEqual(
  computeMissing({ strict: false, noImplicitAny: true }, ['strict', 'noImplicitAny', 'noUncheckedIndexedAccess']),
  ['strict', 'noUncheckedIndexedAccess']
);
// todo cubierto -> []
assert.deepEqual(computeMissing({ strict: true }, ['strict']), []);
// options null -> todo el baseline falta
assert.deepEqual(computeMissing(null, ['strict']), ['strict']);
console.log('tsconfig-fix.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/tsconfig-fix.test.mjs`

- [ ] **Step 3: Implementar `lib/tsconfig-fix.mjs`**

```js
// lib/tsconfig-fix.mjs
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

// Flags del baseline que faltan o están en false en compilerOptions.
export function computeMissing(options, baseline) {
  const opts = options || {};
  return (baseline || []).filter((flag) => opts[flag] !== true);
}

// Escribe los flags faltantes en true dentro de compilerOptions. Solo para JSON limpio.
// Devuelve { written: boolean, missing: string[] }.
export function applyFix(tsconfigPath, baseline) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(tsconfigPath, 'utf8')); }
  catch { return { written: false, missing: [] }; }
  const missing = computeMissing(parsed.compilerOptions, baseline);
  if (missing.length === 0) return { written: false, missing: [] };
  parsed.compilerOptions = parsed.compilerOptions || {};
  for (const flag of missing) parsed.compilerOptions[flag] = true;
  const tmp = tsconfigPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(parsed, null, 2) + '\n');
  renameSync(tmp, tsconfigPath);
  return { written: true, missing };
}
```

- [ ] **Step 4: Correr → PASS.** Run: `node test/lib/tsconfig-fix.test.mjs`

- [ ] **Step 5: Test de la regla (falla)**

Create `test/rules/tsconfig-strictness.test.mjs`:

```js
import rule from '../../rules/tsconfig-strictness.mjs';
import assert from 'node:assert/strict';

const tree = { files: [], dirs: new Set() };

// baseline cubierto -> 0
const full1 = { detected: { typescript: true, tsconfigOptions: { strict: true, noImplicitAny: true } },
  rules: { 'tsconfig-strictness': { enabled: true, baseline: ['strict', 'noImplicitAny'] } } };
assert.equal(rule(tree, full1).length, 0);

// falta un flag -> 1 finding con file tsconfig.json
const full2 = { detected: { typescript: true, tsconfigOptions: { strict: false } },
  rules: { 'tsconfig-strictness': { enabled: true, baseline: ['strict', 'noImplicitAny'] } } };
const out = rule(tree, full2);
assert.equal(out.length, 2, `got ${out.length}`);  // strict(false) + noImplicitAny(ausente)
assert.equal(out[0].file, 'tsconfig.json');
assert.equal(out[0].severity, 'warn');

// sin TS -> 0
assert.equal(rule(tree, { detected: { typescript: false }, rules: { 'tsconfig-strictness': { enabled: true } } }).length, 0);
// tsconfigOptions null -> 0
assert.equal(rule(tree, { detected: { typescript: true, tsconfigOptions: null }, rules: { 'tsconfig-strictness': { enabled: true, baseline: ['strict'] } } }).length, 0);
console.log('tsconfig-strictness.test ok');
```

- [ ] **Step 6: Correr → falla.** Run: `node test/rules/tsconfig-strictness.test.mjs`

- [ ] **Step 7: Implementar `rules/tsconfig-strictness.mjs`**

```js
// rules/tsconfig-strictness.mjs
// Project rule (TS): el tsconfig no fuerza la estrictez del baseline elegido por el dev.
import { computeMissing } from '../lib/tsconfig-fix.mjs';

export default function tsconfigStrictness(tree, full = {}) {
  const cfg = (full.rules && full.rules['tsconfig-strictness']) || {};
  if (cfg.enabled === false) return [];
  const det = full.detected || {};
  if (!det.typescript || det.tsconfigOptions == null) return [];
  const baseline = cfg.baseline || ['strict', 'noImplicitAny'];

  const missing = computeMissing(det.tsconfigOptions, baseline);
  return missing.map((flag) => ({
    rule: 'tsconfig-strictness', severity: 'warn', file: 'tsconfig.json',
    message: `tsconfig no fuerza "${flag}". Activalo para que el linter pueda cazar estos problemas.`,
  }));
}
```

- [ ] **Step 8: Wire en `rules/index.mjs`** (`PROJECT_RULES`)

```js
import tsconfigStrictness from './tsconfig-strictness.mjs';
```
y en `PROJECT_RULES`:
```js
  'tsconfig-strictness': tsconfigStrictness,
```

- [ ] **Step 9: Correr → PASS** + suite. Run: `node test/rules/tsconfig-strictness.test.mjs` y `npm test`

- [ ] **Step 10: Commit**

```bash
git add lib/tsconfig-fix.mjs rules/tsconfig-strictness.mjs rules/index.mjs test/lib/tsconfig-fix.test.mjs test/rules/tsconfig-strictness.test.mjs
git commit -m "feat(rules): tsconfig-strictness (project rule) + lib/tsconfig-fix"
```

---

## Task 9: Flag `--fix-tsconfig` en `praxis-audit`

**Files:**
- Modify: `bin/praxis-audit.mjs`
- Test: `test/bin/praxis-audit-fix-tsconfig.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/bin/praxis-audit-fix-tsconfig.test.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');

// JSON limpio -> escribe los flags faltantes
{
  const dir = mkdtempSync(join(tmpdir(), 'praxis-fixts-'));
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { 'tsconfig-strictness': { baseline: ['strict', 'noImplicitAny'] } } }));
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: false } }, null, 2));
  const r = spawnSync('node', [AUDIT, '--fix-tsconfig', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const ts = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'));
  assert.equal(ts.compilerOptions.strict, true);
  assert.equal(ts.compilerOptions.noImplicitAny, true);
  rmSync(dir, { recursive: true, force: true });
}
// con extends -> NO escribe, avisa
{
  const dir = mkdtempSync(join(tmpdir(), 'praxis-fixts2-'));
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { 'tsconfig-strictness': { baseline: ['strict'] } } }));
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ extends: './base.json', compilerOptions: { strict: false } }, null, 2));
  const r = spawnSync('node', [AUDIT, '--fix-tsconfig', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const ts = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'));
  assert.equal(ts.compilerOptions.strict, false, 'no se modificó (extends)');
  assert.match(r.stdout, /a mano|no fixable|extends/i);
  rmSync(dir, { recursive: true, force: true });
}
console.log('praxis-audit-fix-tsconfig.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/bin/praxis-audit-fix-tsconfig.test.mjs`

- [ ] **Step 3: Modificar `bin/praxis-audit.mjs`**

Agregar import (junto a los otros):

```js
import { applyFix, computeMissing } from '../lib/tsconfig-fix.mjs';
```

Inmediatamente DESPUÉS de calcular `config.detected` (Task 2, Step 4) y ANTES de la lógica de
modo (`const meta = readMeta(dir);`), insertar el manejo del flag:

```js
if (process.argv.includes('--fix-tsconfig')) {
  const det = config.detected || {};
  const baseline = (config.rules && config.rules['tsconfig-strictness'] && config.rules['tsconfig-strictness'].baseline) || ['strict', 'noImplicitAny'];
  if (!det.typescript || !det.tsconfigPath) {
    console.log('praxis-audit: no hay tsconfig.json para arreglar.');
    process.exit(0);
  }
  const missing = computeMissing(det.tsconfigOptions, baseline);
  if (missing.length === 0) {
    console.log('praxis-audit: tsconfig ya cumple el baseline ✅');
    process.exit(0);
  }
  if (!det.tsconfigFixable) {
    console.log(`praxis-audit: tsconfig.json no es auto-fixable (tiene comentarios o "extends"). Agregá estos flags a mano en compilerOptions: ${missing.join(', ')}`);
    process.exit(0);
  }
  const res = applyFix(det.tsconfigPath, baseline);
  console.log(res.written
    ? `praxis-audit: tsconfig.json actualizado — agregados: ${res.missing.join(', ')}`
    : 'praxis-audit: nada que cambiar en tsconfig.json.');
  process.exit(0);
}
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/bin/praxis-audit-fix-tsconfig.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add bin/praxis-audit.mjs test/bin/praxis-audit-fix-tsconfig.test.mjs
git commit -m "feat(audit): flag --fix-tsconfig (aplica el baseline, gate de seguridad)"
```

---

## Task 10: `lib/classname.mjs` + regla `tailwind-arbitrary-values`

**Files:**
- Create: `lib/classname.mjs`
- Create: `rules/tailwind-arbitrary-values.mjs`
- Test: `test/lib/classname.test.mjs`, `test/rules/tailwind-arbitrary-values.test.mjs`

- [ ] **Step 1: Test de classname (falla)**

Create `test/lib/classname.test.mjs`:

```js
import { extractClassNames } from '../../lib/classname.mjs';
import assert from 'node:assert/strict';

const src = [
  '<div className="p-4 flex">',
  "<span className={'text-sm ' + x}>",
  '<b className={clsx("a", "b")}>',
].join('\n');
const out = extractClassNames(src);
assert.ok(out.some((c) => c.value.includes('p-4') && c.line === 1));
assert.ok(out.some((c) => c.value.includes('text-sm') && c.line === 2));
console.log('classname.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/classname.test.mjs`

- [ ] **Step 3: Implementar `lib/classname.mjs`**

```js
// lib/classname.mjs
// Extrae el contenido de className="..." y className={'...'} (string literal directo).
// No resuelve concatenaciones complejas; devuelve los string literals encontrados.
const ATTR_RE = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)')/g;

export function extractClassNames(content) {
  const out = [];
  const lines = String(content).split('\n');
  for (let i = 0; i < lines.length; i++) {
    let m;
    const re = new RegExp(ATTR_RE.source, 'g');
    while ((m = re.exec(lines[i])) !== null) {
      const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
      out.push({ value, line: i + 1 });
    }
  }
  return out;
}
```

- [ ] **Step 4: Correr → PASS.** Run: `node test/lib/classname.test.mjs`

- [ ] **Step 5: Test de la regla (falla)**

Create `test/rules/tailwind-arbitrary-values.test.mjs`:

```js
import rule from '../../rules/tailwind-arbitrary-values.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, allow: [] };
const full = { detected: { tailwind: true } };

// valor arbitrario -> finding
const bad = '<div className="w-[473px] text-sm">';
const out = rule(bad, 'C.tsx', cfg, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'tailwind-arbitrary-values');

// sin arbitrarios -> 0
assert.equal(rule('<div className="w-4 text-sm">', 'C.tsx', cfg, full).length, 0);
// allow cubre el prefijo -> 0
assert.equal(rule('<div className="grid-cols-[1fr_2fr]">', 'C.tsx', { enabled: true, allow: ['grid-cols-'] }, full).length, 0);
// sin tailwind detectado -> 0
assert.equal(rule(bad, 'C.tsx', cfg, { detected: { tailwind: false } }).length, 0);
// archivo .ts (no JSX) -> 0
assert.equal(rule(bad, 'C.ts', cfg, full).length, 0);
console.log('tailwind-arbitrary-values.test ok');
```

- [ ] **Step 6: Correr → falla.** Run: `node test/rules/tailwind-arbitrary-values.test.mjs`

- [ ] **Step 7: Implementar `rules/tailwind-arbitrary-values.mjs`**

```js
// rules/tailwind-arbitrary-values.mjs
// File rule (Tailwind): valores arbitrarios w-[473px], text-[#fff] -> usá tokens del theme.
import { extractClassNames } from '../lib/classname.mjs';

function isJsxFile(p) { return /\.(tsx|jsx)$/.test(String(p)); }

export default function tailwindArbitraryValues(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.tailwind) || !isJsxFile(filePath)) return [];
  const allow = config.allow || [];

  const out = [];
  for (const { value, line } of extractClassNames(content)) {
    for (const cls of value.split(/\s+/).filter(Boolean)) {
      if (!/-\[[^\]]+\]/.test(cls)) continue;             // no es arbitrary value
      if (allow.some((p) => cls.startsWith(p))) continue;  // permitido
      out.push({ rule: 'tailwind-arbitrary-values', line, severity: 'info',
        message: `Valor arbitrario de Tailwind "${cls}". Usá un token del theme en vez de un valor hardcodeado.` });
    }
  }
  return out;
}
```

- [ ] **Step 8: Wire en `rules/index.mjs`**

```js
import tailwindArbitraryValues from './tailwind-arbitrary-values.mjs';
```
en `RULES`:
```js
  'tailwind-arbitrary-values': tailwindArbitraryValues,
```

- [ ] **Step 9: Correr → PASS** + suite. Run: `node test/rules/tailwind-arbitrary-values.test.mjs` y `npm test`

- [ ] **Step 10: Commit**

```bash
git add lib/classname.mjs rules/tailwind-arbitrary-values.mjs rules/index.mjs test/lib/classname.test.mjs test/rules/tailwind-arbitrary-values.test.mjs
git commit -m "feat(rules): tailwind-arbitrary-values + lib/classname"
```

---

## Task 11: Regla `tailwind-classname-bloat`

**Files:**
- Create: `rules/tailwind-classname-bloat.mjs`
- Test: `test/rules/tailwind-classname-bloat.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/tailwind-classname-bloat.test.mjs`:

```js
import rule from '../../rules/tailwind-classname-bloat.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, maxClasses: 4 };
const full = { detected: { tailwind: true } };

// 5 clases con maxClasses 4 -> finding
const bad = '<div className="p-4 flex gap-2 items-center justify-between">';
assert.equal(rule(bad, 'C.tsx', cfg, full).length, 1);

// 3 clases -> 0
assert.equal(rule('<div className="p-4 flex gap-2">', 'C.tsx', cfg, full).length, 0);
// sin tailwind -> 0
assert.equal(rule(bad, 'C.tsx', cfg, { detected: { tailwind: false } }).length, 0);
console.log('tailwind-classname-bloat.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/tailwind-classname-bloat.test.mjs`

- [ ] **Step 3: Implementar `rules/tailwind-classname-bloat.mjs`**

```js
// rules/tailwind-classname-bloat.mjs
// File rule (Tailwind): className con demasiadas clases -> extraé a componente o cva.
import { extractClassNames } from '../lib/classname.mjs';

function isJsxFile(p) { return /\.(tsx|jsx)$/.test(String(p)); }

export default function tailwindClassnameBloat(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.tailwind) || !isJsxFile(filePath)) return [];
  const maxClasses = config.maxClasses ?? 12;

  const out = [];
  for (const { value, line } of extractClassNames(content)) {
    const n = value.split(/\s+/).filter(Boolean).length;
    if (n > maxClasses) {
      out.push({ rule: 'tailwind-classname-bloat', line, severity: 'info',
        message: `className con ${n} clases (umbral ${maxClasses}). Extraé a un componente o usá cva/tailwind-variants.` });
    }
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`**

```js
import tailwindClassnameBloat from './tailwind-classname-bloat.mjs';
```
en `RULES`:
```js
  'tailwind-classname-bloat': tailwindClassnameBloat,
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/tailwind-classname-bloat.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/tailwind-classname-bloat.mjs rules/index.mjs test/rules/tailwind-classname-bloat.test.mjs
git commit -m "feat(rules): tailwind-classname-bloat"
```

---

## Task 12: Regla `tailwind-conditional-concat`

**Files:**
- Create: `rules/tailwind-conditional-concat.mjs`
- Test: `test/rules/tailwind-conditional-concat.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/tailwind-conditional-concat.test.mjs`:

```js
import rule from '../../rules/tailwind-conditional-concat.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };
const full = { detected: { tailwind: true } };

// concatenación con ternario dentro de className={...} -> finding
const bad = "<div className={'p-4 ' + (active ? 'bg-blue' : 'bg-gray')}>";
assert.equal(rule(bad, 'C.tsx', cfg, full).length, 1);

// uso de cn/clsx -> 0
assert.equal(rule('<div className={cn("p-4", active && "bg-blue")}>', 'C.tsx', cfg, full).length, 0);
// className estático -> 0
assert.equal(rule('<div className="p-4">', 'C.tsx', cfg, full).length, 0);
// sin tailwind -> 0
assert.equal(rule(bad, 'C.tsx', cfg, { detected: { tailwind: false } }).length, 0);
console.log('tailwind-conditional-concat.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/tailwind-conditional-concat.test.mjs`

- [ ] **Step 3: Implementar `rules/tailwind-conditional-concat.mjs`**

```js
// rules/tailwind-conditional-concat.mjs
// File rule (Tailwind): className={'...' + (cond ? 'a' : 'b')} -> usá clsx/cn.
function isJsxFile(p) { return /\.(tsx|jsx)$/.test(String(p)); }

// className={ ... } cuyo contenido tiene una concatenación de strings con + y un ternario/&&.
const CONCAT_RE = /className\s*=\s*\{[^}]*['"][^'"}]*['"]\s*\+[^}]*\?[^}]*\}/;
const LOGIC_CONCAT_RE = /className\s*=\s*\{[^}]*['"][^'"}]*['"]\s*\+[^}]*&&[^}]*\}/;

export default function tailwindConditionalConcat(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.tailwind) || !isJsxFile(filePath)) return [];

  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (CONCAT_RE.test(lines[i]) || LOGIC_CONCAT_RE.test(lines[i])) {
      out.push({ rule: 'tailwind-conditional-concat', line: i + 1, severity: 'warn',
        message: `className armado por concatenación condicional. Usá clsx/cn: clases dinámicas mal concatenadas se rompen con el purge.` });
    }
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`**

```js
import tailwindConditionalConcat from './tailwind-conditional-concat.mjs';
```
en `RULES`:
```js
  'tailwind-conditional-concat': tailwindConditionalConcat,
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/tailwind-conditional-concat.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/tailwind-conditional-concat.mjs rules/index.mjs test/rules/tailwind-conditional-concat.test.mjs
git commit -m "feat(rules): tailwind-conditional-concat (usar clsx/cn)"
```

---

## Task 13: Regla `tailwind-duplicate-utilities`

**Files:**
- Create: `rules/tailwind-duplicate-utilities.mjs`
- Test: `test/rules/tailwind-duplicate-utilities.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/tailwind-duplicate-utilities.test.mjs`:

```js
import rule from '../../rules/tailwind-duplicate-utilities.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };
const full = { detected: { tailwind: true } };

// p-2 y p-4 (misma familia p-) -> finding
assert.equal(rule('<div className="p-2 flex p-4">', 'C.tsx', cfg, full).length, 1);
// clase exacta duplicada -> finding
assert.equal(rule('<div className="flex gap-2 flex">', 'C.tsx', cfg, full).length, 1);
// sin duplicados -> 0
assert.equal(rule('<div className="p-2 flex gap-2">', 'C.tsx', cfg, full).length, 0);
// sin tailwind -> 0
assert.equal(rule('<div className="p-2 p-4">', 'C.tsx', cfg, { detected: { tailwind: false } }).length, 0);
console.log('tailwind-duplicate-utilities.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/tailwind-duplicate-utilities.test.mjs`

- [ ] **Step 3: Implementar `rules/tailwind-duplicate-utilities.mjs`**

```js
// rules/tailwind-duplicate-utilities.mjs
// File rule (Tailwind): clases duplicadas o de la misma familia repetidas en un className.
import { extractClassNames } from '../lib/classname.mjs';

function isJsxFile(p) { return /\.(tsx|jsx)$/.test(String(p)); }

// Familia = prefijo hasta el último '-' (p-4 -> 'p', text-sm -> 'text', bg-red-500 -> 'bg-red').
// Para utilities sin '-' (flex, block) la familia es la clase entera.
function family(cls) {
  const base = cls.replace(/^[a-z]+:/i, '');         // saca variantes (hover:, md:)
  const i = base.lastIndexOf('-');
  return i === -1 ? base : base.slice(0, i);
}

export default function tailwindDuplicateUtilities(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if (!(full.detected && full.detected.tailwind) || !isJsxFile(filePath)) return [];

  const out = [];
  for (const { value, line } of extractClassNames(content)) {
    const classes = value.split(/\s+/).filter(Boolean);
    const seenExact = new Set();
    const seenFamily = new Map();
    let flagged = false;
    for (const cls of classes) {
      if (seenExact.has(cls)) { flagged = true; break; }
      seenExact.add(cls);
      const fam = family(cls);
      // solo familias "de valor único" conocidas que chocan (p, m, w, h, text, bg, block/flex display)
      if (seenFamily.has(fam) && /^(p|m|px|py|pt|pb|pl|pr|mx|my|w|h|gap|text|bg)$/.test(fam)) { flagged = true; break; }
      seenFamily.set(fam, cls);
    }
    // display contradictorio
    const displays = classes.filter((c) => /^(block|flex|grid|inline|inline-block|hidden|contents)$/.test(c));
    if (displays.length > 1) flagged = true;
    if (flagged) {
      out.push({ rule: 'tailwind-duplicate-utilities', line, severity: 'warn',
        message: `Clases duplicadas o contradictorias en el className. Dejá una sola por propiedad.` });
    }
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`**

```js
import tailwindDuplicateUtilities from './tailwind-duplicate-utilities.mjs';
```
en `RULES`:
```js
  'tailwind-duplicate-utilities': tailwindDuplicateUtilities,
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/tailwind-duplicate-utilities.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/tailwind-duplicate-utilities.mjs rules/index.mjs test/rules/tailwind-duplicate-utilities.test.mjs
git commit -m "feat(rules): tailwind-duplicate-utilities"
```

---

## Task 14: Documentación

**Files:**
- Modify: `skills/praxis-config/SKILL.md`
- Modify: `skills/praxis-audit/SKILL.md`
- Modify: `AGENTS.md` (CLAUDE.md es symlink → editar AGENTS.md)
- Modify: `README.md`

- [ ] **Step 1: `skills/praxis-config/SKILL.md`**

En la lista de reglas configurables (después del bloque de arquitectura agregado antes), añadir:

```markdown
   - **Reglas TypeScript** (autodetect si hay `tsconfig.json`): `repeated-object-shape`
     (`minProps`/`minRepeats`), `stringly-typed` (`minLiterals`), `duplicate-literal-union`
     (`minMembers`/`minRepeats`), `prefer-as-const`, y `tsconfig-strictness` (`baseline`:
     lista de flags a exigir, ej. `["strict","noImplicitAny"]`). Estas NO duplican ESLint:
     apuntan al aprovechamiento de tipos.
   - **Reglas Tailwind** (autodetect si hay `tailwind.config.*`): `tailwind-arbitrary-values`
     (`allow`), `tailwind-classname-bloat` (`maxClasses`), `tailwind-conditional-concat`,
     `tailwind-duplicate-utilities`.
```

Y actualizar la línea "No inventes ids de regla: solo las diez de arriba..." a:

```markdown
- No inventes ids de regla: las del catálogo (contenido, arquitectura, TypeScript, Tailwind).
```

- [ ] **Step 2: `skills/praxis-audit/SKILL.md`**

Agregar bajo "Cómo correrlo":

```markdown
- Arreglar tsconfig (opt-in): `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --fix-tsconfig --dir <proyecto>`
  - Aplica el `baseline` de `tsconfig-strictness` a `compilerOptions`. Solo escribe si el
    `tsconfig.json` es JSON limpio sin `extends`; si no, lista los flags para agregar a mano.
```

- [ ] **Step 3: `AGENTS.md`** — actualizar la enumeración de reglas (la línea que lista las de arquitectura), agregando:

```markdown
Reglas TypeScript (autodetect, aprovechamiento de tipos, no duplican ESLint):
`repeated-object-shape`, `stringly-typed`, `duplicate-literal-union`, `prefer-as-const`
(por-archivo) y `tsconfig-strictness` (auditoría, con fixer `praxis-audit --fix-tsconfig`).
Reglas Tailwind (autodetect si hay tailwind.config): `tailwind-arbitrary-values`,
`tailwind-classname-bloat`, `tailwind-conditional-concat`, `tailwind-duplicate-utilities`.
```

- [ ] **Step 4: `README.md`** — agregar dos subsecciones de tablas (TS y Tailwind) con el mismo
  formato que las tablas existentes de reglas, listando id + qué detecta + que son autodetect.
  Incluir una nota sobre `praxis-audit --fix-tsconfig` y su gate de seguridad (no toca tsconfig
  con `extends`/comentarios).

- [ ] **Step 5: Verificar y commit**

Run: `npm test` (Expected: todos los test files pasan)

```bash
git add skills/praxis-config/SKILL.md skills/praxis-audit/SKILL.md AGENTS.md README.md
git commit -m "docs: grupos de reglas TypeScript y Tailwind + --fix-tsconfig"
```

---

## Self-review (cobertura del spec)

- **A.1 detect-stack** → Task 1.
- **A.2 inyección en orquestadores** → Task 2.
- **A.3 gating por stack + extensión** → cada regla (Tasks 4-13) chequea `detected` + extensión; defaults en Task 3.
- **B.1 repeated-object-shape** → Task 4. **B.2 stringly-typed** → Task 5. **B.3 duplicate-literal-union** → Task 6. **B.4 prefer-as-const** → Task 7. **B.5 tsconfig-strictness + fixer** → Task 8 (regla + lib) y Task 9 (flag CLI).
- **C.1-C.4 Tailwind** → Task 10 (arbitrary-values + lib/classname), 11 (bloat), 12 (conditional-concat), 13 (duplicate-utilities).
- **D componentes** → cubiertos; `lib/classname.mjs` (no estaba en la tabla del spec, lo agrego como helper compartido en Task 10 — mejora de diseño DRY para las 4 reglas Tailwind).
- **E testing** → cada Task trae su test; detect-stack (T1), fixer (T8/T9), gating (en cada regla).
- **F riesgos** → mitigados por umbrales, severidad `info`, gate del fixer.

Consistencia de nombres: `detectStack`, `config.detected`, `computeMissing`/`applyFix`,
`extractClassNames`, ids de regla exactos como en `defaults.json` y `KNOWN_RULES`.
