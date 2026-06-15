# Reglas de arquitectura + drift + auditoría — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar al plugin reglas de arquitectura (file + project), registro de reglas en config, detección de drift y un motor de auditoría de proyecto con disparadores (versión/fingerprint → full, git diff → incremental, pre-commit configurable).

**Architecture:** Se extiende la firma de las file rules para recibir la config completa (4º arg), se agrega una segunda clase de regla (`PROJECT_RULES`, solo auditoría), y un motor `bin/praxis-audit.mjs` que reusa `runDetector`. El estado vive en `.praxis-guard/meta.json`. Todo determinista y zero-dep ESM, igual que el MVP.

**Tech Stack:** Node ≥18, ESM `.mjs`, sin dependencias. Tests = scripts `.mjs` con `node:assert/strict`, ejecutados por `test/run.mjs`.

**Spec:** `docs/specs/2026-06-15-architecture-rules-and-audit-design.md`

**Convención de tests del repo (importante):** no hay framework. Cada test es un `.mjs` que importa el módulo, hace `assert`, y termina con `console.log('<nombre>.test ok')`. `test/run.mjs` importa todos los `*.test.mjs`. Para correr **todo**: `npm test`. Para correr **uno**: `node test/ruta/al.test.mjs`. Un test "falla" si tira una excepción (assert) al importarse.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `rules/index.mjs` (mod) | Exporta `RULES` (file) y `PROJECT_RULES` (project) |
| `hooks/detect.mjs` (mod) | Pasa la config completa como 4º arg a cada file rule |
| `lib/glob.mjs` (new) | `matchGlob(path, glob)` — globs `**`/`*` → regex |
| `lib/imports.mjs` (new) | `extractImports(content)` → `[{source,line}]` |
| `rules/folder-placement.mjs` (new) | File rule: cada tipo en su carpeta |
| `rules/layer-boundaries.mjs` (new) | File rule: dirección de imports entre capas |
| `rules/server-client-boundaries.mjs` (new) | File rule: client no importa server-only |
| `rules/feature-deps.mjs` (new) | File rule: features no importan internos ajenos |
| `rules/architecture-coherence.mjs` (new) | Project rule: coherencia by-feature/by-layer |
| `lib/walk.mjs` (new) | `enumerateFiles(root,cfg)`, `buildProjectTree(files)` |
| `lib/meta.mjs` (new) | `readMeta/writeMeta` (merge) de `.praxis-guard/meta.json` |
| `lib/fingerprint.mjs` (new) | `rulesFingerprint(config)` |
| `lib/validate-config.mjs` (mod) | Valida `architecture`, reglas nuevas, `commit` |
| `config/defaults.json` (mod) | + `architecture`, + 4 reglas (disabled), + `commit` |
| `bin/praxis-audit.mjs` (new) | Motor de auditoría + disparadores |
| `bin/praxis-config.mjs` (mod) | Estampa `reviewed_rules` + `rules_fingerprint` en meta |
| `bin/install-hooks.mjs` (mod) | + target `precommit` |
| `hooks/praxis-session-offer.mjs` (mod) | + oferta de drift (reglas no revisadas) |
| `skills/praxis-audit/SKILL.md` (new) | Wrapper conversacional del auditor |
| `CLAUDE.md`, `README.md` (mod) | Documentar lo nuevo |

---

## Task 1: Extender firma de file rule + split de índice

Las reglas de arquitectura necesitan leer `config.architecture`, pero hoy `runDetector` solo le pasa a cada regla su propio `ruleCfg`. Agregamos un 4º argumento (la config completa), retro-compatible (las 5 reglas actuales lo ignoran). Y partimos el índice en `RULES` + `PROJECT_RULES`.

**Files:**
- Modify: `hooks/detect.mjs:24`
- Modify: `rules/index.mjs`
- Test: `test/rules/index.test.mjs` (create)

- [ ] **Step 1: Escribir el test que falla**

Create `test/rules/index.test.mjs`:

```js
import { RULES, PROJECT_RULES } from '../../rules/index.mjs';
import assert from 'node:assert/strict';

// Las 5 file rules del MVP siguen presentes.
for (const id of ['secrets','hardcoded-data','forbidden-imports','file-responsibility','untranslated-text']) {
  assert.equal(typeof RULES[id], 'function', `falta file rule ${id}`);
}
// PROJECT_RULES existe y es objeto (puede estar vacío todavía).
assert.equal(typeof PROJECT_RULES, 'object');
assert.ok(PROJECT_RULES && !Array.isArray(PROJECT_RULES));
console.log('index.test ok');
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node test/rules/index.test.mjs`
Expected: FALLA con `SyntaxError`/`undefined` porque `PROJECT_RULES` no se exporta aún.

- [ ] **Step 3: Modificar `rules/index.mjs`**

Replace el archivo entero por:

```js
// rules/index.mjs
import secrets from './secrets.mjs';
import hardcodedData from './hardcoded-data.mjs';
import forbiddenImports from './forbidden-imports.mjs';
import fileResponsibility from './file-responsibility.mjs';
import untranslatedText from './untranslated-text.mjs';

// File rules: (content, filePath, ruleConfig, fullConfig) => Finding[]
// Corren en el hook PostToolUse y, por archivo, en la auditoría.
export const RULES = {
  'secrets': secrets,
  'hardcoded-data': hardcodedData,
  'forbidden-imports': forbiddenImports,
  'file-responsibility': fileResponsibility,
  'untranslated-text': untranslatedText,
};

// Project rules: (projectTree, fullConfig) => Finding[]
// Corren SOLO en la auditoría (miran el árbol del proyecto).
export const PROJECT_RULES = {};
```

- [ ] **Step 4: Modificar `hooks/detect.mjs` para pasar la config completa**

En `hooks/detect.mjs`, línea 24, cambiar:

```js
      const res = fn(src, filePath, ruleCfg);
```

por:

```js
      const res = fn(src, filePath, ruleCfg, cfg);
```

- [ ] **Step 5: Correr el test y la suite completa**

Run: `node test/rules/index.test.mjs` → Expected: PASS (`index.test ok`)
Run: `npm test` → Expected: todos los test files pasan (las 5 reglas ignoran el 4º arg).

- [ ] **Step 6: Commit**

```bash
git add rules/index.mjs hooks/detect.mjs test/rules/index.test.mjs
git commit -m "feat(rules): firma de file rule con config completa + PROJECT_RULES"
```

---

## Task 2: Helpers compartidos `lib/glob.mjs` y `lib/imports.mjs`

Varias reglas necesitan matchear globs de path y extraer imports. Centralizamos para DRY.

**Files:**
- Create: `lib/glob.mjs`
- Create: `lib/imports.mjs`
- Test: `test/lib/glob.test.mjs`, `test/lib/imports.test.mjs`

- [ ] **Step 1: Test de glob (falla)**

Create `test/lib/glob.test.mjs`:

```js
import { matchGlob } from '../../lib/glob.mjs';
import assert from 'node:assert/strict';

assert.ok(matchGlob('src/features/checkout/hooks/useCart.ts', '**/hooks/**'));
assert.ok(matchGlob('src/hooks/useX.ts', '**/hooks/**'));
assert.ok(!matchGlob('src/components/Button.tsx', '**/hooks/**'));
assert.ok(matchGlob('src/app/page.tsx', 'src/app/**'));
assert.ok(!matchGlob('lib/app/page.tsx', 'src/app/**'));
assert.ok(matchGlob('a/b.ts', 'a/*.ts'));
assert.ok(!matchGlob('a/b/c.ts', 'a/*.ts')); // * no cruza /
console.log('glob.test ok');
```

- [ ] **Step 2: Correr → falla** (`Cannot find module lib/glob.mjs`). Run: `node test/lib/glob.test.mjs`

- [ ] **Step 3: Implementar `lib/glob.mjs`**

```js
// lib/glob.mjs
// Glob mínimo para paths: ** cruza directorios, * no cruza '/'.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {       // **  -> cualquier cosa (incl. '/')
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;  // consumir el '/' que sigue a **
      } else {
        re += '[^/]*';                 // *   -> dentro de un segmento
      }
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

export function matchGlob(path, glob) {
  return globToRegExp(glob).test(String(path).replace(/\\/g, '/'));
}
```

- [ ] **Step 4: Correr → PASS.** Run: `node test/lib/glob.test.mjs`

- [ ] **Step 5: Test de imports (falla)**

Create `test/lib/imports.test.mjs`:

```js
import { extractImports } from '../../lib/imports.mjs';
import assert from 'node:assert/strict';

const src = [
  "import a from '@/domain/user';",
  "import { b } from \"../infra/db\";",
  "export { c } from './local';",
  "const d = require('node:fs');",
  "const noimport = 1;",
].join('\n');

const out = extractImports(src);
const sources = out.map((x) => x.source);
assert.deepEqual(sources, ['@/domain/user', '../infra/db', './local', 'node:fs']);
assert.equal(out[0].line, 1);
assert.equal(out[3].line, 4);
console.log('imports.test ok');
```

- [ ] **Step 6: Correr → falla.** Run: `node test/lib/imports.test.mjs`

- [ ] **Step 7: Implementar `lib/imports.mjs`**

```js
// lib/imports.mjs
// Extrae sources de import/export-from/require. Mismo regex base que forbidden-imports.
const IMPORT_RE = /^\s*(?:import\b[^'"]*|export\b[^'"]*from\s*|.*\brequire\s*\()\s*['"]([^'"]+)['"]/;

export function extractImports(content) {
  const out = [];
  const lines = String(content).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = IMPORT_RE.exec(lines[i]);
    if (m) out.push({ source: m[1], line: i + 1 });
  }
  return out;
}
```

- [ ] **Step 8: Correr → PASS** y suite completa. Run: `node test/lib/imports.test.mjs` y `npm test`

- [ ] **Step 9: Commit**

```bash
git add lib/glob.mjs lib/imports.mjs test/lib/glob.test.mjs test/lib/imports.test.mjs
git commit -m "feat(lib): helpers glob y extractImports"
```

---

## Task 3: Config defaults + validación

Agregamos `architecture`, las 4 reglas nuevas (disabled), y `commit` a `config/defaults.json`, y extendemos el validador.

**Files:**
- Modify: `config/defaults.json`
- Modify: `lib/validate-config.mjs`
- Test: `test/lib/validate-config.test.mjs` (append)

- [ ] **Step 1: Añadir casos al test (fallan)**

Append a `test/lib/validate-config.test.mjs` (antes de cualquier `console.log` final; si hay uno, dejarlo al final):

```js
// --- arquitectura + reglas nuevas + commit ---
{
  const ok = validateConfig({
    architecture: { strategy: 'by-feature', root: 'src', featuresDir: 'src/features', sharedDirs: ['src/shared'] },
    rules: {
      'folder-placement': { enabled: true, placement: [{ kind: 'hook', match: '^use[A-Z]', allowed: ['**/hooks/**'] }] },
      'layer-boundaries': { enabled: true, layers: [{ name: 'domain', path: 'src/domain', mayImport: [] }] },
      'feature-deps': { enabled: false, publicEntry: ['index.ts'] },
      'server-client-boundaries': { enabled: false, serverOnly: ['server-only'] },
      'architecture-coherence': { enabled: false },
    },
    commit: { check: true, block: false, minSeverity: 'warn' },
  });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
}
{
  const bad = validateConfig({ architecture: { strategy: 'nope' } });
  assert.equal(bad.ok, false);
}
{
  const bad = validateConfig({ rules: { 'layer-boundaries': { layers: 'x' } } });
  assert.equal(bad.ok, false);
}
{
  const bad = validateConfig({ commit: { minSeverity: 'fatal' } });
  assert.equal(bad.ok, false);
}
console.log('validate-config arch cases ok');
```

- [ ] **Step 2: Correr → falla** (reglas/claves desconocidas, sin validación de strategy). Run: `node test/lib/validate-config.test.mjs`

- [ ] **Step 3: Modificar `lib/validate-config.mjs`**

Reemplazar la constante `KNOWN_RULES` (línea 4) por:

```js
const KNOWN_RULES = ['secrets', 'hardcoded-data', 'forbidden-imports', 'file-responsibility', 'untranslated-text',
  'folder-placement', 'architecture-coherence', 'layer-boundaries', 'server-client-boundaries', 'feature-deps'];
const STRATEGIES = ['by-feature', 'by-layer'];
const SEVERITIES = ['info', 'warn', 'error'];
```

Dentro de `validateConfig`, después del bloque `if ('rules' in obj) {...}` y antes de `return`, agregar:

```js
  if ('architecture' in obj) {
    const a = obj.architecture;
    if (!isObject(a)) {
      errors.push('architecture debe ser un objeto');
    } else {
      if ('strategy' in a && a.strategy !== null && !STRATEGIES.includes(a.strategy))
        errors.push(`architecture.strategy debe ser null o uno de: ${STRATEGIES.join(', ')}`);
      for (const k of ['root', 'featuresDir']) {
        if (k in a && typeof a[k] !== 'string') errors.push(`architecture.${k} debe ser string`);
      }
      if ('sharedDirs' in a && !isStringArray(a.sharedDirs)) errors.push('architecture.sharedDirs debe ser array de strings');
    }
  }

  if ('commit' in obj) {
    const c = obj.commit;
    if (!isObject(c)) {
      errors.push('commit debe ser un objeto');
    } else {
      for (const k of ['check', 'block']) {
        if (k in c && typeof c[k] !== 'boolean') errors.push(`commit.${k} debe ser boolean`);
      }
      if ('minSeverity' in c && !SEVERITIES.includes(c.minSeverity))
        errors.push(`commit.minSeverity debe ser uno de: ${SEVERITIES.join(', ')}`);
    }
  }
```

Dentro del loop `for (const [id, rule] of Object.entries(obj.rules))`, después del bloque de `untranslated-text`, agregar la validación de las reglas nuevas:

```js
        if (id === 'folder-placement' && 'placement' in rule) {
          if (!Array.isArray(rule.placement)) {
            errors.push('rules.folder-placement.placement debe ser un array');
          } else {
            rule.placement.forEach((e, i) => {
              if (!isObject(e) || typeof e.kind !== 'string' || typeof e.match !== 'string' || !isStringArray(e.allowed))
                errors.push(`rules.folder-placement.placement[${i}] debe tener kind, match (strings) y allowed (array de strings)`);
            });
          }
        }
        if (id === 'layer-boundaries' && 'layers' in rule) {
          if (!Array.isArray(rule.layers)) {
            errors.push('rules.layer-boundaries.layers debe ser un array');
          } else {
            rule.layers.forEach((e, i) => {
              if (!isObject(e) || typeof e.name !== 'string' || typeof e.path !== 'string' || !isStringArray(e.mayImport))
                errors.push(`rules.layer-boundaries.layers[${i}] debe tener name, path (strings) y mayImport (array de strings)`);
            });
          }
        }
        if (id === 'server-client-boundaries' && 'serverOnly' in rule && !isStringArray(rule.serverOnly)) {
          errors.push('rules.server-client-boundaries.serverOnly debe ser array de strings');
        }
        if (id === 'feature-deps' && 'publicEntry' in rule && !isStringArray(rule.publicEntry)) {
          errors.push('rules.feature-deps.publicEntry debe ser array de strings');
        }
```

- [ ] **Step 4: Modificar `config/defaults.json`**

Reemplazar el archivo entero por:

```json
{
  "include": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  "exclude": ["node_modules/", ".next/", "dist/", "build/", ".git/", "coverage/"],
  "architecture": {
    "strategy": null,
    "root": "src",
    "featuresDir": "src/features",
    "sharedDirs": ["src/shared", "src/lib"]
  },
  "commit": { "check": true, "block": false, "minSeverity": "warn" },
  "rules": {
    "secrets": { "enabled": true },
    "hardcoded-data": { "enabled": true, "minElements": 8 },
    "forbidden-imports": { "enabled": true, "list": [] },
    "file-responsibility": { "enabled": true, "maxLines": 400, "mixedSignalsLines": 200 },
    "untranslated-text": { "enabled": true, "attributes": ["placeholder", "title", "alt", "aria-label", "label"], "ignore": [] },
    "folder-placement": { "enabled": false, "placement": [] },
    "architecture-coherence": { "enabled": false },
    "layer-boundaries": { "enabled": false, "layers": [] },
    "server-client-boundaries": { "enabled": false, "serverOnly": ["server-only", "next/headers", "fs", "node:fs", "node:fs/promises", "node:crypto"] },
    "feature-deps": { "enabled": false, "publicEntry": ["index.ts", "index.tsx"] }
  }
}
```

- [ ] **Step 5: Correr tests → PASS.** Run: `node test/lib/validate-config.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add config/defaults.json lib/validate-config.mjs test/lib/validate-config.test.mjs
git commit -m "feat(config): bloque architecture, commit y 4 reglas nuevas (opt-in)"
```

---

## Task 4: Regla `folder-placement` (file)

Marca un archivo que, por su tipo (detectado vía `match` contra basename o contenido), no vive en una carpeta permitida. Gated por `architecture.strategy !== null`.

**Files:**
- Create: `rules/folder-placement.mjs`
- Create: `test/fixtures/folder-placement/bad/useCart.ts`, `test/fixtures/folder-placement/good/useCart.ts`
- Test: `test/rules/folder-placement.test.mjs`

- [ ] **Step 1: Crear fixtures**

Create `test/fixtures/folder-placement/bad/useCart.ts`:
```ts
export function useCart() { return 1; }
```
Create `test/fixtures/folder-placement/good/useCart.ts`:
```ts
export function useCart() { return 1; }
```
(El contenido da igual: el placement se evalúa por el `filePath` que pasamos en el test.)

- [ ] **Step 2: Escribir el test (falla)**

Create `test/rules/folder-placement.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import rule from '../../rules/folder-placement.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, placement: [
  { kind: 'hook', match: '^use[A-Z]', allowed: ['**/hooks/**'] },
  { kind: 'server-action', match: "'use server'", allowed: ['**/_actions/**'] },
]};
const full = { architecture: { strategy: 'by-feature' } };
const src = readFileSync(new URL('../fixtures/folder-placement/bad/useCart.ts', import.meta.url), 'utf8');

// hook fuera de **/hooks/** -> 1 finding
const bad = rule(src, 'src/components/useCart.ts', cfg, full);
assert.equal(bad.length, 1, `esperaba 1, got ${bad.length}`);
assert.equal(bad[0].rule, 'folder-placement');
assert.equal(bad[0].severity, 'warn');

// hook en su carpeta -> 0
assert.equal(rule(src, 'src/features/cart/hooks/useCart.ts', cfg, full).length, 0);

// sin strategy declarada -> regla no corre
assert.equal(rule(src, 'src/components/useCart.ts', cfg, { architecture: { strategy: null } }).length, 0);

// server-action por señal de contenido, fuera de _actions -> 1
const sa = rule("'use server'\nexport async function x(){}", 'src/lib/x.ts', cfg, full);
assert.equal(sa.length, 1);
console.log('folder-placement.test ok');
```

- [ ] **Step 3: Correr → falla.** Run: `node test/rules/folder-placement.test.mjs`

- [ ] **Step 4: Implementar `rules/folder-placement.mjs`**

```js
// rules/folder-placement.mjs
// File rule: cada tipo de archivo en su carpeta permitida.
// El tipo se detecta con `match` (regex) contra el basename o el contenido.
import { basename } from 'node:path';
import { matchGlob } from '../lib/glob.mjs';

export default function folderPlacement(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  const arch = full.architecture || {};
  if (arch.strategy == null) return [];          // opt-in: sin estrategia no corre
  const placement = config.placement || [];
  if (placement.length === 0) return [];

  const path = String(filePath).replace(/\\/g, '/');
  const base = basename(path);
  const out = [];
  for (const entry of placement) {
    if (!entry || !entry.kind || !entry.match || !Array.isArray(entry.allowed)) continue;
    let re;
    try { re = new RegExp(entry.match); } catch { continue; }
    const applies = re.test(base) || re.test(content);
    if (!applies) continue;
    const ok = entry.allowed.some((g) => matchGlob(path, g));
    if (!ok) {
      out.push({ rule: 'folder-placement', severity: 'warn',
        message: `Archivo de tipo "${entry.kind}" fuera de lugar: debería estar en ${entry.allowed.join(' | ')}.` });
    }
  }
  return out;
}
```

- [ ] **Step 5: Wire en `rules/index.mjs`**

Agregar el import arriba y la entrada en `RULES`:

```js
import folderPlacement from './folder-placement.mjs';
```
y dentro de `RULES`, después de `untranslated-text`:
```js
  'folder-placement': folderPlacement,
```

- [ ] **Step 6: Correr → PASS** + suite. Run: `node test/rules/folder-placement.test.mjs` y `npm test`

- [ ] **Step 7: Commit**

```bash
git add rules/folder-placement.mjs rules/index.mjs test/rules/folder-placement.test.mjs test/fixtures/folder-placement
git commit -m "feat(rules): folder-placement (cada tipo en su carpeta)"
```

---

## Task 5: Regla `layer-boundaries` (file)

Detecta la capa del archivo por su path y marca imports a capas no permitidas por `mayImport`. Una capa se reconoce si su `path` o su `name` aparece como segmento del path/source (heurístico, coherente con el enfoque regex del MVP).

**Files:**
- Create: `rules/layer-boundaries.mjs`
- Test: `test/rules/layer-boundaries.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/layer-boundaries.test.mjs`:

```js
import rule from '../../rules/layer-boundaries.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, layers: [
  { name: 'domain', path: 'src/domain', mayImport: [] },
  { name: 'infra',  path: 'src/infra',  mayImport: ['domain'] },
  { name: 'ui',     path: 'src/ui',     mayImport: ['domain', 'infra'] },
]};
const full = { architecture: { strategy: 'by-layer' } };

// domain importando infra -> prohibido
const bad = rule("import { db } from '@/infra/db';", 'src/domain/user.ts', cfg, full);
assert.equal(bad.length, 1, `got ${bad.length}`);
assert.equal(bad[0].rule, 'layer-boundaries');
assert.equal(bad[0].line, 1);

// ui importando domain -> permitido
assert.equal(rule("import { U } from '@/domain/user';", 'src/ui/Page.tsx', cfg, full).length, 0);

// import a algo fuera de capas conocidas -> ignorado
assert.equal(rule("import x from 'react';", 'src/domain/user.ts', cfg, full).length, 0);

// archivo fuera de toda capa -> ignorado
assert.equal(rule("import { db } from '@/infra/db';", 'scripts/seed.ts', cfg, full).length, 0);

// sin strategy -> no corre
assert.equal(rule("import { db } from '@/infra/db';", 'src/domain/user.ts', cfg, { architecture: {} }).length, 0);
console.log('layer-boundaries.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/layer-boundaries.test.mjs`

- [ ] **Step 3: Implementar `rules/layer-boundaries.mjs`**

```js
// rules/layer-boundaries.mjs
// File rule: dirección de imports permitida entre capas (por path).
import { extractImports } from '../lib/imports.mjs';

// ¿La capa `layer` aparece como segmento en `s`? Reconoce por path o por name.
function hits(s, layer) {
  const str = String(s).replace(/\\/g, '/');
  const needles = [layer.path, layer.name].filter(Boolean).map((x) => x.replace(/\\/g, '/'));
  return needles.some((n) => str === n || str.includes('/' + n + '/') || str.startsWith(n + '/') || str.includes('/' + n) && str.split('/').includes(n));
}
function layerOf(s, layers) {
  return layers.find((l) => hits(s, l)) || null;
}

export default function layerBoundaries(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if ((full.architecture || {}).strategy == null) return [];
  const layers = config.layers || [];
  if (layers.length === 0) return [];

  const fileLayer = layerOf(filePath, layers);
  if (!fileLayer) return [];

  const out = [];
  for (const { source, line } of extractImports(content)) {
    const target = layerOf(source, layers);
    if (!target || target.name === fileLayer.name) continue;
    if (!(fileLayer.mayImport || []).includes(target.name)) {
      out.push({ rule: 'layer-boundaries', line, severity: 'warn',
        message: `La capa "${fileLayer.name}" no puede importar de "${target.name}" (import "${source}").` });
    }
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`**

```js
import layerBoundaries from './layer-boundaries.mjs';
```
en `RULES`:
```js
  'layer-boundaries': layerBoundaries,
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/layer-boundaries.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/layer-boundaries.mjs rules/index.mjs test/rules/layer-boundaries.test.mjs
git commit -m "feat(rules): layer-boundaries (dirección de imports entre capas)"
```

---

## Task 6: Regla `server-client-boundaries` (file)

Si el archivo es client component (`'use client'`), marca imports de módulos server-only.

**Files:**
- Create: `rules/server-client-boundaries.mjs`
- Test: `test/rules/server-client-boundaries.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/server-client-boundaries.test.mjs`:

```js
import rule from '../../rules/server-client-boundaries.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, serverOnly: ['server-only', 'next/headers', 'node:fs'] };
const full = { architecture: { strategy: 'by-feature' } };

const client = [
  "'use client';",
  "import { cookies } from 'next/headers';",
  "import fs from 'node:fs';",
  "export default function C(){ return null; }",
].join('\n');
const bad = rule(client, 'src/ui/C.tsx', cfg, full);
assert.equal(bad.length, 2, `got ${bad.length}`);
assert.equal(bad[0].rule, 'server-client-boundaries');

// server component (sin 'use client') -> 0
const server = "import { cookies } from 'next/headers';\nexport default function S(){ return null; }";
assert.equal(rule(server, 'src/ui/S.tsx', cfg, full).length, 0);

// client sin imports server-only -> 0
assert.equal(rule("'use client';\nimport { useState } from 'react';", 'src/ui/D.tsx', cfg, full).length, 0);

// sin strategy -> no corre
assert.equal(rule(client, 'src/ui/C.tsx', cfg, { architecture: {} }).length, 0);
console.log('server-client-boundaries.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/server-client-boundaries.test.mjs`

- [ ] **Step 3: Implementar `rules/server-client-boundaries.mjs`**

```js
// rules/server-client-boundaries.mjs
// File rule: un client component no debe importar módulos server-only.
import { extractImports } from '../lib/imports.mjs';

const USE_CLIENT = /^\s*['"]use client['"]\s*;?\s*$/;

function isClientComponent(content) {
  for (const line of String(content).split('\n')) {
    if (line.trim() === '') continue;
    if (USE_CLIENT.test(line)) return true;
    if (line.trim().startsWith('//') || line.trim().startsWith('/*')) continue;
    break; // la directiva debe ir arriba de todo (después de comentarios)
  }
  return false;
}

export default function serverClientBoundaries(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  if ((full.architecture || {}).strategy == null) return [];
  if (!isClientComponent(content)) return [];
  const serverOnly = config.serverOnly || [];
  const out = [];
  for (const { source, line } of extractImports(content)) {
    const banned = serverOnly.some((m) => source === m || source.startsWith(m + '/')) || source.startsWith('node:');
    if (banned) {
      out.push({ rule: 'server-client-boundaries', line, severity: 'warn',
        message: `Client component importa módulo server-only "${source}". Movélo a un server component o a un boundary.` });
    }
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`**

```js
import serverClientBoundaries from './server-client-boundaries.mjs';
```
en `RULES`:
```js
  'server-client-boundaries': serverClientBoundaries,
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/server-client-boundaries.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/server-client-boundaries.mjs rules/index.mjs test/rules/server-client-boundaries.test.mjs
git commit -m "feat(rules): server-client-boundaries"
```

---

## Task 7: Regla `feature-deps` (file)

Una feature no importa los internos de otra; solo su API pública (el index/barrel de la feature). Usa `architecture.featuresDir`.

**Files:**
- Create: `rules/feature-deps.mjs`
- Test: `test/rules/feature-deps.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/feature-deps.test.mjs`:

```js
import rule from '../../rules/feature-deps.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, publicEntry: ['index.ts', 'index.tsx'] };
const full = { architecture: { strategy: 'by-feature', featuresDir: 'src/features' } };

// checkout importa interno de catalog -> prohibido
const bad = rule("import { x } from '@/features/catalog/internal/util';", 'src/features/checkout/ui/Page.tsx', cfg, full);
assert.equal(bad.length, 1, `got ${bad.length}`);
assert.equal(bad[0].rule, 'feature-deps');

// checkout importa API pública de catalog (su raíz) -> permitido
assert.equal(rule("import { x } from '@/features/catalog';", 'src/features/checkout/ui/Page.tsx', cfg, full).length, 0);

// import dentro de la MISMA feature -> permitido
assert.equal(rule("import { y } from '@/features/checkout/lib/y';", 'src/features/checkout/ui/Page.tsx', cfg, full).length, 0);

// archivo fuera de featuresDir -> no corre
assert.equal(rule("import { x } from '@/features/catalog/internal/util';", 'src/app/page.tsx', cfg, full).length, 0);
console.log('feature-deps.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/feature-deps.test.mjs`

- [ ] **Step 3: Implementar `rules/feature-deps.mjs`**

```js
// rules/feature-deps.mjs
// File rule: una feature solo importa la API pública de otra feature, no sus internos.
import { extractImports } from '../lib/imports.mjs';

// Devuelve { feature, rest } si `s` apunta dentro de featuresDir; si no, null.
// rest = path interno después de <feature>/ (vacío => raíz/API pública).
function featureRef(s, featuresBase) {
  const str = String(s).replace(/\\/g, '/');
  const idx = str.indexOf(featuresBase + '/');
  if (idx === -1) return null;
  const after = str.slice(idx + featuresBase.length + 1);
  const parts = after.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return { feature: parts[0], rest: parts.slice(1) };
}

export default function featureDeps(content, filePath, config = {}, full = {}) {
  if (config.enabled === false) return [];
  const arch = full.architecture || {};
  if (arch.strategy == null) return [];
  const featuresDir = (arch.featuresDir || 'src/features').replace(/\\/g, '/');
  const featuresBase = featuresDir.split('/').filter(Boolean).pop(); // 'features'
  const publicEntry = config.publicEntry || ['index.ts', 'index.tsx'];

  const self = featureRef(filePath, featuresBase);
  if (!self) return [];

  const out = [];
  for (const { source, line } of extractImports(content)) {
    const ref = featureRef(source, featuresBase);
    if (!ref || ref.feature === self.feature) continue;     // misma feature o no-feature
    const isPublic = ref.rest.length === 0 ||
      (ref.rest.length === 1 && publicEntry.includes(ref.rest[0]));
    if (!isPublic) {
      out.push({ rule: 'feature-deps', line, severity: 'warn',
        message: `La feature "${self.feature}" importa un interno de "${ref.feature}" ("${source}"). Importá su API pública.` });
    }
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`**

```js
import featureDeps from './feature-deps.mjs';
```
en `RULES`:
```js
  'feature-deps': featureDeps,
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/feature-deps.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/feature-deps.mjs rules/index.mjs test/rules/feature-deps.test.mjs
git commit -m "feat(rules): feature-deps (aislamiento entre features)"
```

---

## Task 8: Regla `architecture-coherence` (project)

Project rule: recibe `(projectTree, fullConfig)` y marca incoherencias de estrategia. `projectTree = { files: string[], dirs: Set<string> }`.

**Files:**
- Create: `rules/architecture-coherence.mjs`
- Modify: `rules/index.mjs` (registrar en `PROJECT_RULES`)
- Test: `test/rules/architecture-coherence.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/rules/architecture-coherence.test.mjs`:

```js
import rule from '../../rules/architecture-coherence.mjs';
import assert from 'node:assert/strict';

const tree = (dirs) => ({ files: [], dirs: new Set(dirs) });

// by-feature con src/components global intruso -> finding
const full1 = { architecture: { strategy: 'by-feature', root: 'src', featuresDir: 'src/features', sharedDirs: ['src/shared'] }, rules: { 'architecture-coherence': { enabled: true } } };
const bad = rule(tree(['src', 'src/components', 'src/features', 'src/features/cart']), full1);
assert.ok(bad.length >= 1, 'esperaba al menos 1 finding');
assert.equal(bad[0].rule, 'architecture-coherence');

// by-feature limpio -> 0
assert.equal(rule(tree(['src', 'src/features', 'src/features/cart', 'src/shared']), full1).length, 0);

// by-layer con featuresDir presente -> finding
const full2 = { architecture: { strategy: 'by-layer', root: 'src', featuresDir: 'src/features', sharedDirs: [] }, rules: { 'architecture-coherence': { enabled: true } } };
assert.ok(rule(tree(['src', 'src/domain', 'src/features']), full2).length >= 1);

// sin strategy -> 0
const full3 = { architecture: { strategy: null }, rules: { 'architecture-coherence': { enabled: true } } };
assert.equal(rule(tree(['src', 'src/components']), full3).length, 0);
console.log('architecture-coherence.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/rules/architecture-coherence.test.mjs`

- [ ] **Step 3: Implementar `rules/architecture-coherence.mjs`**

```js
// rules/architecture-coherence.mjs
// Project rule: coherencia global con architecture.strategy.
const TYPE_DIRS = ['components', 'hooks', 'services', 'models', 'containers', 'utils'];

export default function architectureCoherence(tree, full = {}) {
  const arch = full.architecture || {};
  const cfg = (full.rules && full.rules['architecture-coherence']) || {};
  if (cfg.enabled === false) return [];
  if (arch.strategy == null) return [];

  const root = (arch.root || 'src').replace(/\\/g, '/');
  const featuresDir = (arch.featuresDir || 'src/features').replace(/\\/g, '/');
  const shared = (arch.sharedDirs || []).map((d) => d.replace(/\\/g, '/'));
  const dirs = tree.dirs instanceof Set ? tree.dirs : new Set(tree.dirs || []);
  const out = [];

  if (arch.strategy === 'by-feature') {
    // dirs de tipo colgando directo del root (no bajo features ni shared) -> drift
    for (const t of TYPE_DIRS) {
      const candidate = `${root}/${t}`;
      if (!dirs.has(candidate)) continue;
      const underShared = shared.some((s) => candidate === s || candidate.startsWith(s + '/'));
      if (underShared) continue;
      out.push({ rule: 'architecture-coherence', severity: 'warn', file: candidate,
        message: `Estrategia by-feature pero existe "${candidate}" global. Movélo dentro de una feature o a sharedDirs.` });
    }
  } else if (arch.strategy === 'by-layer') {
    if (dirs.has(featuresDir)) {
      out.push({ rule: 'architecture-coherence', severity: 'warn', file: featuresDir,
        message: `Estrategia by-layer pero existe "${featuresDir}". Mezcla de estrategias: elegí una.` });
    }
  }
  return out;
}
```

- [ ] **Step 4: Wire en `rules/index.mjs`** (`PROJECT_RULES`)

```js
import architectureCoherence from './architecture-coherence.mjs';
```
y:
```js
export const PROJECT_RULES = {
  'architecture-coherence': architectureCoherence,
};
```

- [ ] **Step 5: Correr → PASS** + suite. Run: `node test/rules/architecture-coherence.test.mjs` y `npm test`

- [ ] **Step 6: Commit**

```bash
git add rules/architecture-coherence.mjs rules/index.mjs test/rules/architecture-coherence.test.mjs
git commit -m "feat(rules): architecture-coherence (project rule)"
```

---

## Task 9: `lib/meta.mjs` — lectura/escritura con merge

`.praxis-guard/meta.json` se escribe desde dos lugares (praxis-config y praxis-audit), así que necesita merge (no pisar campos del otro).

**Files:**
- Create: `lib/meta.mjs`
- Test: `test/lib/meta.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/lib/meta.test.mjs`:

```js
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMeta, writeMeta } from '../../lib/meta.mjs';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'praxis-meta-'));
try {
  assert.deepEqual(readMeta(dir), {}, 'meta vacía al inicio');
  writeMeta(dir, { plugin_version: '0.2.0', reviewed_rules: ['secrets'] });
  writeMeta(dir, { last_audited_commit: 'abc' });           // merge, no pisa
  const m = readMeta(dir);
  assert.equal(m.plugin_version, '0.2.0');
  assert.deepEqual(m.reviewed_rules, ['secrets']);
  assert.equal(m.last_audited_commit, 'abc');
  const onDisk = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'meta.json'), 'utf8'));
  assert.equal(onDisk.last_audited_commit, 'abc');
  console.log('meta.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/meta.test.mjs`

- [ ] **Step 3: Implementar `lib/meta.mjs`**

```js
// lib/meta.mjs
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function metaPath(dir) { return join(dir, '.praxis-guard', 'meta.json'); }

export function readMeta(dir) {
  try { return JSON.parse(readFileSync(metaPath(dir), 'utf8')); }
  catch { return {}; }
}

export function writeMeta(dir, patch) {
  const next = { ...readMeta(dir), ...patch };
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  const p = metaPath(dir);
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  renameSync(tmp, p);
  return next;
}
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/lib/meta.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add lib/meta.mjs test/lib/meta.test.mjs
git commit -m "feat(lib): meta.mjs (read/write .praxis-guard/meta.json con merge)"
```

---

## Task 10: `lib/fingerprint.mjs` — huella de reglas

`rules_fingerprint` cambia si togglás una regla, cambiás sus params, editás su código fuente, o cambiás el bloque `architecture`.

**Files:**
- Create: `lib/fingerprint.mjs`
- Test: `test/lib/fingerprint.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/lib/fingerprint.test.mjs`:

```js
import { rulesFingerprint } from '../../lib/fingerprint.mjs';
import assert from 'node:assert/strict';

const base = { architecture: { strategy: 'by-feature' }, rules: { secrets: { enabled: true } } };
const a = rulesFingerprint(base);
const b = rulesFingerprint(JSON.parse(JSON.stringify(base)));
assert.equal(a, b, 'misma config -> mismo hash');
assert.ok(a.startsWith('sha256:'));

const toggled = rulesFingerprint({ ...base, rules: { secrets: { enabled: false } } });
assert.notEqual(a, toggled, 'toggle de regla cambia el hash');

const archChanged = rulesFingerprint({ ...base, architecture: { strategy: 'by-layer' } });
assert.notEqual(a, archChanged, 'cambio de architecture cambia el hash');
console.log('fingerprint.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/fingerprint.test.mjs`

- [ ] **Step 3: Implementar `lib/fingerprint.mjs`**

```js
// lib/fingerprint.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { RULES, PROJECT_RULES } from '../rules/index.mjs';

const RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules');

export function rulesFingerprint(config = {}) {
  const h = createHash('sha256');
  const ids = [...Object.keys(RULES), ...Object.keys(PROJECT_RULES)].sort();
  for (const id of ids) {
    const rc = (config.rules && config.rules[id]) || {};
    const enabled = rc.enabled !== false;
    h.update(`\n#${id}:${enabled}\n`);
    h.update(JSON.stringify(rc));
    try { h.update(readFileSync(join(RULES_DIR, `${id}.mjs`), 'utf8')); } catch { /* regla sin archivo */ }
  }
  h.update('\n@architecture\n');
  h.update(JSON.stringify(config.architecture || null));
  return 'sha256:' + h.digest('hex');
}
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/lib/fingerprint.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add lib/fingerprint.mjs test/lib/fingerprint.test.mjs
git commit -m "feat(lib): fingerprint.mjs (huella de reglas+architecture)"
```

---

## Task 11: `lib/walk.mjs` — enumerar archivos y árbol

**Files:**
- Create: `lib/walk.mjs`
- Test: `test/lib/walk.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/lib/walk.test.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enumerateFiles, buildProjectTree } from '../../lib/walk.mjs';
import assert from 'node:assert/strict';

const root = mkdtempSync(join(tmpdir(), 'praxis-walk-'));
try {
  mkdirSync(join(root, 'src', 'features', 'cart'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), 'x');
  writeFileSync(join(root, 'src', 'features', 'cart', 'b.tsx'), 'x');
  writeFileSync(join(root, 'src', 'readme.md'), 'x');           // fuera de include
  writeFileSync(join(root, 'node_modules', 'x', 'c.ts'), 'x');  // excluido

  const cfg = { include: ['.ts', '.tsx'], exclude: ['node_modules/'] };
  const files = enumerateFiles(root, cfg);
  assert.deepEqual(files, ['src/a.ts', 'src/features/cart/b.tsx']);

  const tree = buildProjectTree(files);
  assert.ok(tree.dirs.has('src'));
  assert.ok(tree.dirs.has('src/features/cart'));
  assert.ok(!tree.dirs.has('node_modules'));
  console.log('walk.test ok');
} finally { rmSync(root, { recursive: true, force: true }); }
```

- [ ] **Step 2: Correr → falla.** Run: `node test/lib/walk.test.mjs`

- [ ] **Step 3: Implementar `lib/walk.mjs`**

```js
// lib/walk.mjs
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isInScope } from './scope.mjs';

export function enumerateFiles(root, config = {}) {
  const exclude = (config.exclude || []).map((d) => d.replace(/\/$/, ''));
  const out = [];
  (function walk(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const name of entries) {
      const p = join(d, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) {
        if (!exclude.includes(name)) walk(p);
      } else {
        const rel = relative(root, p).replace(/\\/g, '/');
        if (isInScope(rel, config)) out.push(rel);
      }
    }
  })(root);
  return out.sort();
}

export function buildProjectTree(files) {
  const dirs = new Set();
  for (const f of files) {
    const parts = f.split('/');
    parts.pop();
    let acc = '';
    for (const p of parts) { acc = acc ? acc + '/' + p : p; dirs.add(acc); }
  }
  return { files, dirs };
}
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/lib/walk.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add lib/walk.mjs test/lib/walk.test.mjs
git commit -m "feat(lib): walk.mjs (enumerateFiles + buildProjectTree)"
```

---

## Task 12: `praxis-config` estampa `reviewed_rules` + `rules_fingerprint`

Al escribir la config, además de los campos actuales de meta, registramos qué reglas quedaron revisadas y la huella. Usamos `writeMeta` (merge) para no pisar `last_audited_commit`.

**Files:**
- Modify: `bin/praxis-config.mjs`
- Test: `test/bin/praxis-config.test.mjs` (append)

- [ ] **Step 1: Añadir caso al test (falla)**

Append a `test/bin/praxis-config.test.mjs`. (El test existente ya invoca el CLI; seguí su mismo patrón de `execFileSync`/`spawnSync`. Ejemplo de aserción a agregar tras un `write` en un dir temporal `dir`):

```js
// meta.json registra reviewed_rules + rules_fingerprint
{
  const meta = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'meta.json'), 'utf8'));
  assert.ok(Array.isArray(meta.reviewed_rules) && meta.reviewed_rules.includes('secrets'),
    'reviewed_rules debe incluir las reglas registradas');
  assert.ok(typeof meta.rules_fingerprint === 'string' && meta.rules_fingerprint.startsWith('sha256:'),
    'rules_fingerprint presente');
}
```

> Si el test existente no tiene a mano `readFileSync`/`join`, agregá los imports arriba. Mirá cómo el test actual ejecuta `bin/praxis-config.mjs write` y reusá ese `dir`.

- [ ] **Step 2: Correr → falla.** Run: `node test/bin/praxis-config.test.mjs`

- [ ] **Step 3: Modificar `bin/praxis-config.mjs`**

Agregar imports arriba (después de la línea de `validate-config`):

```js
import { loadConfig, defaultProjectConfigPath } from '../lib/config.mjs';
import { rulesFingerprint } from '../lib/fingerprint.mjs';
import { writeMeta } from '../lib/meta.mjs';
import { RULES, PROJECT_RULES } from '../rules/index.mjs';
```

En el bloque `if (cmd === 'write')`, reemplazar el `writeAtomic(metaPath, ...)` actual por:

```js
  const merged = loadConfig({ projectConfigPath: defaultProjectConfigPath(dir), override: obj });
  writeMeta(dir, {
    configured_by: gitUser(dir),
    configured_at: new Date().toISOString().slice(0, 10),
    plugin_version: pluginVersion(),
    schema_version: 1,
    reviewed_rules: [...Object.keys(RULES), ...Object.keys(PROJECT_RULES)].sort(),
    rules_fingerprint: rulesFingerprint(merged),
  });
```

> Nota: `defaultProjectConfigPath` acepta `cwd`. Como el config recién se escribió en `dir`, pasarlo asegura el merge correcto. `writeMeta` ya hace `mkdir` + escritura atómica, así que se puede borrar la variable `metaPath` local y el `writeAtomic` del meta si quedaran sin uso (dejar `writeAtomic` para el config).

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/bin/praxis-config.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add bin/praxis-config.mjs test/bin/praxis-config.test.mjs
git commit -m "feat(praxis-config): estampar reviewed_rules + rules_fingerprint en meta"
```

---

## Task 13: `bin/praxis-audit.mjs` — full audit + project rules + reporte

Primer corte del motor: modo `--full` (o por defecto cuando no hay meta), corre file rules sobre todos los archivos in-scope + project rules, e imprime un reporte. Sin lógica git todavía.

**Files:**
- Create: `bin/praxis-audit.mjs`
- Test: `test/bin/praxis-audit.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/bin/praxis-audit.test.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-audit-'));
try {
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  // config: activa secrets (file rule) sobre un archivo con un secreto evidente
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({
    rules: { secrets: { enabled: true } }
  }));
  writeFileSync(join(dir, 'src', 'leak.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef";');

  const r = spawnSync('node', [AUDIT, '--full', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, `exit 0, got ${r.status}: ${r.stderr}`);
  assert.match(r.stdout, /leak\.ts/, 'el reporte menciona el archivo con finding');
  console.log('praxis-audit full.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

> El fixture de `secrets` del MVP usa un patrón tipo `sk_live_...`; si el detector real exige otro formato, copiá el contenido exacto de `test/fixtures/secrets/bad/keys.ts` en `leak.ts` para garantizar el match.

- [ ] **Step 2: Correr → falla.** Run: `node test/bin/praxis-audit.test.mjs`

- [ ] **Step 3: Implementar `bin/praxis-audit.mjs` (primer corte)**

```js
// bin/praxis-audit.mjs
// Motor de auditoría de proyecto. Reusa runDetector (file rules) + PROJECT_RULES.
// Modos: --full (todo), --staged (git staged), --since <ref> (incremental),
// o decisión automática (versión/fingerprint -> full; si no -> incremental).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, defaultProjectConfigPath } from '../lib/config.mjs';
import { isInScope } from '../lib/scope.mjs';
import { formatFindings } from '../lib/findings.mjs';
import { enumerateFiles, buildProjectTree } from '../lib/walk.mjs';
import { runDetector } from '../hooks/detect.mjs';
import { PROJECT_RULES } from '../rules/index.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def) {
  const eq = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}

const dir = resolve(arg('dir', process.cwd()));
const config = loadConfig({ projectConfigPath: defaultProjectConfigPath(dir) });

function runFileRules(relPaths) {
  const findings = [];
  for (const rel of relPaths) {
    const abs = join(dir, rel);
    let res;
    try { res = runDetector(abs, { config }); } catch { continue; }
    for (const f of res.findings) findings.push({ ...f, file: rel });
  }
  return findings;
}

function runProjectRules() {
  const tree = buildProjectTree(enumerateFiles(dir, config));
  const findings = [];
  for (const [id, fn] of Object.entries(PROJECT_RULES)) {
    const rc = (config.rules && config.rules[id]) || {};
    if (rc.enabled === false) continue;
    try { for (const f of fn(tree, config)) findings.push({ ...f, file: f.file || '(proyecto)' }); }
    catch { /* una regla rota nunca rompe la auditoría */ }
  }
  return findings;
}

function report(findings) {
  if (!findings.length) { console.log('praxis-audit: sin findings ✅'); return; }
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, fs] of byFile) console.log(formatFindings(fs, file) + '\n');
  console.log(`praxis-audit: ${findings.length} finding(s) en ${byFile.size} archivo(s).`);
}

// --- primer corte: solo full ---
const files = enumerateFiles(dir, config);
const findings = [...runFileRules(files), ...runProjectRules()];
report(findings);
process.exit(0);
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/bin/praxis-audit.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add bin/praxis-audit.mjs test/bin/praxis-audit.test.mjs
git commit -m "feat(audit): motor base praxis-audit (full + project rules + reporte)"
```

---

## Task 14: Decisión de modo + incremental git + update de meta

Agregamos la decisión automática (versión/fingerprint → full; si no → incremental por git diff), `--since`, y el avance de `last_audited_commit` tras una corrida full/incremental.

**Files:**
- Modify: `bin/praxis-audit.mjs`
- Test: `test/bin/praxis-audit-mode.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/bin/praxis-audit-mode.test.mjs`:

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

const dir = mkdtempSync(join(tmpdir(), 'praxis-audit-mode-'));
try {
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@t.t']);
  git(dir, ['config', 'user.name', 't']);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json') || '', '', ); // ensure dir below
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { secrets: { enabled: true } } }));
  writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;');
  git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'init']);

  // 1ª corrida: sin meta -> full -> debería estampar last_audited_commit
  let r = spawnSync('node', [AUDIT, '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const meta1 = JSON.parse(spawnSync('cat', [join(dir, '.praxis-guard', 'meta.json')], { encoding: 'utf8' }).stdout);
  assert.ok(meta1.last_audited_commit, 'estampa last_audited_commit tras full');
  assert.ok(meta1.rules_fingerprint, 'estampa fingerprint');

  // agregar un archivo con secreto y commitear
  writeFileSync(join(dir, 'src', 'leak.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef";');
  git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'leak']);

  // 2ª corrida: misma versión+fingerprint -> incremental -> audita solo el diff (leak.ts)
  r = spawnSync('node', [AUDIT, '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /leak\.ts/, 'incremental detecta el archivo nuevo');
  console.log('praxis-audit-mode.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

> Si `cat` no estuviera disponible en el entorno de CI, reemplazá esa lectura por `readFileSync` (import al tope). Se usó `spawnSync('cat', …)` solo por brevedad.

- [ ] **Step 2: Correr → falla.** Run: `node test/bin/praxis-audit-mode.test.mjs`

- [ ] **Step 3: Modificar `bin/praxis-audit.mjs`**

Agregar imports al tope (junto a los demás):

```js
import { rulesFingerprint } from '../lib/fingerprint.mjs';
import { readMeta, writeMeta } from '../lib/meta.mjs';
```

Agregar helper de versión (después de `arg`):

```js
function pluginVersion() {
  try {
    const m = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    return m.version || '0.0.0';
  } catch { return '0.0.0'; }
}
function gitLines(d, args) {
  try { return execSync(`git ${args}`, { cwd: d, encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean); }
  catch { return null; }
}
function head(d) { const l = gitLines(d, 'rev-parse HEAD'); return l && l[0]; }
function diffFiles(d, ref) {
  const committed = gitLines(d, `diff --name-only ${ref}..HEAD`);
  if (committed == null) return null;             // sin git / ref inválido
  const unstaged = gitLines(d, 'diff --name-only') || [];
  const staged = gitLines(d, 'diff --name-only --cached') || [];
  const all = new Set([...committed, ...unstaged, ...staged].map((p) => p.replace(/\\/g, '/')));
  return [...all].filter((p) => isInScope(p, config));
}
function structuralChanged(d, ref) {
  const st = gitLines(d, `diff --name-status ${ref}..HEAD`);
  if (st == null) return true;                    // ante la duda, corré project rules
  return st.some((line) => /^[ADR]/.test(line));
}
```

Reemplazar el bloque `// --- primer corte: solo full ---` y lo que sigue por:

```js
const meta = readMeta(dir);
const fp = rulesFingerprint(config);
const ver = pluginVersion();
const forceFull = process.argv.includes('--full');
const sinceArg = arg('since', null);

let mode, targets = null;
if (forceFull) {
  mode = 'full';
} else if (sinceArg) {
  mode = 'incremental'; targets = diffFiles(dir, sinceArg);
} else if (ver !== meta.plugin_version || fp !== meta.rules_fingerprint || !meta.last_audited_commit) {
  mode = 'full';
} else {
  mode = 'incremental'; targets = diffFiles(dir, meta.last_audited_commit);
}
if (mode === 'incremental' && targets == null) mode = 'full';   // degradación sin git

let findings;
let ranProject = false;
if (mode === 'full') {
  const files = enumerateFiles(dir, config);
  findings = [...runFileRules(files), ...runProjectRules()];
  ranProject = true;
} else {
  findings = runFileRules(targets);
  const ref = sinceArg || meta.last_audited_commit;
  if (structuralChanged(dir, ref)) { findings = [...findings, ...runProjectRules()]; ranProject = true; }
}

report(findings);
console.log(`praxis-audit: modo ${mode}${ranProject ? ' (con project rules)' : ''}.`);

// Avanzar el estado tras full/incremental (no en --staged, que viene en Task 15).
const h = head(dir);
if (h) writeMeta(dir, { last_audited_commit: h, rules_fingerprint: fp, plugin_version: ver });

process.exit(0);
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/bin/praxis-audit-mode.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add bin/praxis-audit.mjs test/bin/praxis-audit-mode.test.mjs
git commit -m "feat(audit): decisión de modo (full/incremental) + git diff + update de meta"
```

---

## Task 15: `--staged` + bloqueo de commit configurable

Modo para pre-commit: audita solo lo staged, NO avanza `last_audited_commit` (el commit todavía no ocurrió), y devuelve exit 1 solo si `commit.block` y hay findings ≥ `minSeverity`.

**Files:**
- Modify: `bin/praxis-audit.mjs`
- Test: `test/bin/praxis-audit-staged.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/bin/praxis-audit-staged.test.mjs`:

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

function setup(commitCfg) {
  const dir = mkdtempSync(join(tmpdir(), 'praxis-staged-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@t.t']); git(dir, ['config', 'user.name', 't']);
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), JSON.stringify({ rules: { secrets: { enabled: true } }, commit: commitCfg }));
  writeFileSync(join(dir, 'src', 'leak.ts'), 'const k = "sk_live_0123456789abcdef0123456789abcdef";');
  git(dir, ['add', 'src/leak.ts']);   // staged
  return dir;
}

// block:false -> avisa pero exit 0
{
  const dir = setup({ check: true, block: false, minSeverity: 'warn' });
  const r = spawnSync('node', [AUDIT, '--staged', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'block:false no bloquea');
  assert.match(r.stdout, /leak\.ts/);
  rmSync(dir, { recursive: true, force: true });
}
// block:true + warn -> exit 1
{
  const dir = setup({ check: true, block: true, minSeverity: 'warn' });
  const r = spawnSync('node', [AUDIT, '--staged', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1, 'block:true con finding >= warn bloquea');
  rmSync(dir, { recursive: true, force: true });
}
console.log('praxis-audit-staged.test ok');
```

- [ ] **Step 2: Correr → falla.** Run: `node test/bin/praxis-audit-staged.test.mjs`

- [ ] **Step 3: Modificar `bin/praxis-audit.mjs`**

Agregar `stagedFiles` junto a los otros helpers git:

```js
function stagedFiles(d) {
  const s = gitLines(d, 'diff --name-only --cached') || [];
  return s.map((p) => p.replace(/\\/g, '/')).filter((p) => isInScope(p, config));
}
```

En la decisión de modo, agregar `--staged` como primer caso (antes de `forceFull`):

```js
const staged = process.argv.includes('--staged');
```
y al inicio del `if/else` de modo:
```js
if (staged) {
  mode = 'staged'; targets = stagedFiles(dir);
} else if (forceFull) {
  ...
```

En la ejecución, manejar `staged` como un incremental sin project rules estructurales (corre file rules sobre staged; project rules solo si hay cambios estructurales staged — por simplicidad, NO correr project rules en staged):

Reemplazar el bloque `if (mode === 'full') {...} else {...}` por:

```js
let findings;
let ranProject = false;
if (mode === 'full') {
  const files = enumerateFiles(dir, config);
  findings = [...runFileRules(files), ...runProjectRules()];
  ranProject = true;
} else if (mode === 'staged') {
  findings = runFileRules(targets || []);
} else {
  findings = runFileRules(targets);
  const ref = sinceArg || meta.last_audited_commit;
  if (structuralChanged(dir, ref)) { findings = [...findings, ...runProjectRules()]; ranProject = true; }
}
```

Reemplazar el cierre (update de meta + exit) por:

```js
report(findings);
console.log(`praxis-audit: modo ${mode}${ranProject ? ' (con project rules)' : ''}.`);

// staged NO avanza el estado (el commit aún no ocurrió).
if (mode !== 'staged') {
  const h = head(dir);
  if (h) writeMeta(dir, { last_audited_commit: h, rules_fingerprint: fp, plugin_version: ver });
}

// Bloqueo de commit configurable.
let exitCode = 0;
if (mode === 'staged') {
  const commitCfg = config.commit || {};
  if (commitCfg.block) {
    const rank = { info: 1, warn: 2, error: 3 };
    const min = rank[commitCfg.minSeverity] || 2;
    if (findings.some((f) => (rank[f.severity] || 1) >= min)) exitCode = 1;
  }
}
process.exit(exitCode);
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/bin/praxis-audit-staged.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add bin/praxis-audit.mjs test/bin/praxis-audit-staged.test.mjs
git commit -m "feat(audit): --staged + bloqueo de commit configurable"
```

---

## Task 16: Target `precommit` en `install-hooks.mjs`

Instala un git `pre-commit` en el proyecto target que corre `node <plugin>/bin/praxis-audit.mjs --staged --dir <repo>`.

**Files:**
- Modify: `bin/install-hooks.mjs`
- Test: `test/bin/install-hooks-precommit.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/bin/install-hooks-precommit.test.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INSTALL = join(PLUGIN_ROOT, 'bin', 'install-hooks.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-precommit-'));
try {
  spawnSync('git', ['init', '-q'], { cwd: dir });
  const r = spawnSync('node', [INSTALL, '--target', dir, '--cli', 'precommit'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const hook = join(dir, '.git', 'hooks', 'pre-commit');
  assert.ok(existsSync(hook), 'pre-commit instalado');
  const body = readFileSync(hook, 'utf8');
  assert.match(body, /praxis-audit\.mjs/);
  assert.match(body, /--staged/);
  // ejecutable
  assert.ok((statSync(hook).mode & 0o111) !== 0, 'pre-commit es ejecutable');
  console.log('install-hooks precommit.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

- [ ] **Step 2: Correr → falla.** Run: `node test/bin/install-hooks-precommit.test.mjs`

- [ ] **Step 3: Modificar `bin/install-hooks.mjs`**

Agregar import de `chmodSync`:

```js
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
```

Agregar un `case` al `switch (cli)`:

```js
  case 'precommit': {
    const hooksDir = join(target, '.git', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const audit = join(PLUGIN_ROOT, 'bin', 'praxis-audit.mjs');
    const dest = join(hooksDir, 'pre-commit');
    const body = `#!/bin/sh\n# praxis-guard pre-commit (auto-instalado)\nnode ${JSON.stringify(audit)} --staged --dir "$(git rev-parse --show-toplevel)"\n`;
    writeFileSync(dest, body);
    chmodSync(dest, 0o755);
    console.log(`installed pre-commit hook -> ${dest}`);
    break;
  }
```

Actualizar el mensaje de uso del `default`:

```js
    console.error('usage: node bin/install-hooks.mjs --target <dir> --cli <copilot|codex|opencode|precommit>');
```

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/bin/install-hooks-precommit.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add bin/install-hooks.mjs test/bin/install-hooks-precommit.test.mjs
git commit -m "feat(install): target precommit (git pre-commit -> praxis-audit --staged)"
```

---

## Task 17: Drift en SessionStart (reglas no revisadas)

El hook de SessionStart ya ofrece `praxis-config` cuando no hay config. Le sumamos: si hay config pero `meta.reviewed_rules` no cubre todas las reglas registradas, avisar del drift (reusa el mismo marker one-time, con sufijo distinto para no chocar).

**Files:**
- Modify: `hooks/praxis-session-offer.mjs`
- Test: `test/hooks/session-offer-drift.test.mjs`

- [ ] **Step 1: Test (falla)**

Create `test/hooks/session-offer-drift.test.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'praxis-session-offer.mjs');

const dir = mkdtempSync(join(tmpdir(), 'praxis-drift-'));
try {
  // proyecto Next con config y meta que solo revisó 'secrets' -> faltan reglas -> drift
  writeFileSync(join(dir, 'next.config.js'), 'module.exports = {};');
  mkdirSync(join(dir, '.praxis-guard'), { recursive: true });
  writeFileSync(join(dir, '.praxis-guard', 'config.json'), '{}');
  writeFileSync(join(dir, '.praxis-guard', 'meta.json'), JSON.stringify({ reviewed_rules: ['secrets'] }));

  const r = spawnSync('node', [HOOK], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: dir, TMPDIR: dir } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /regla/i, 'avisa de reglas nuevas/no revisadas');
  console.log('session-offer-drift.test ok');
} finally { rmSync(dir, { recursive: true, force: true }); }
```

> El marker one-time vive en `tmpdir()`. El test fuerza `TMPDIR=dir` para aislarlo y evitar falsos negativos por una corrida previa.

- [ ] **Step 2: Correr → falla.** Run: `node test/hooks/session-offer-drift.test.mjs`

- [ ] **Step 3: Modificar `hooks/praxis-session-offer.mjs`**

Agregar imports al tope:

```js
import { RULES, PROJECT_RULES } from '../rules/index.mjs';
```
> Si el path relativo no resuelve por cómo se invoca el hook, usar `new URL('../rules/index.mjs', import.meta.url)` con import dinámico dentro del try.

Agregar helper antes del `try`:

```js
function driftMarkerPath(cwd) {
  const h = createHash('sha256').update('drift:' + cwd).digest('hex');
  return join(tmpdir(), `praxis-guard-drift-${h}`);
}
```

Dentro del `try`, después del bloque actual (que ofrece config cuando NO existe `.praxis-guard/config.json`), agregar un `else` para el caso "config existe pero hay drift":

```js
  } else if (existsSync(join(cwd, '.praxis-guard', 'config.json'))) {
    let reviewed = [];
    try { reviewed = JSON.parse(readFileSync(join(cwd, '.praxis-guard', 'meta.json'), 'utf8')).reviewed_rules || []; }
    catch { reviewed = []; }
    const registered = [...Object.keys(RULES), ...Object.keys(PROJECT_RULES)];
    const unreviewed = registered.filter((id) => !reviewed.includes(id));
    if (unreviewed.length > 0) {
      const marker = driftMarkerPath(cwd);
      if (!existsSync(marker)) {
        writeFileSync(marker, cwd);
        process.stdout.write(
          `praxis-guard: hay ${unreviewed.length} regla(s) sin revisar (${unreviewed.join(', ')}). ` +
          'Corré la skill `praxis-config` para decidir sobre ellas.\n'
        );
      }
    }
  }
```

> Estructuralmente: el `if (isNextProject(cwd) && !existsSync(config))` actual queda como rama 1; agregás la rama `else if` de drift. Cuidá que `isNextProject(cwd)` siga gateando ambas ramas (envolvé el `else if` dentro del mismo `if (isNextProject(cwd))`).

- [ ] **Step 4: Correr → PASS** + suite. Run: `node test/hooks/session-offer-drift.test.mjs` y `npm test`

- [ ] **Step 5: Commit**

```bash
git add hooks/praxis-session-offer.mjs test/hooks/session-offer-drift.test.mjs
git commit -m "feat(hooks): SessionStart avisa de reglas sin revisar (drift)"
```

---

## Task 18: Skill `praxis-audit`

Wrapper conversacional que invoca el motor y presenta el reporte. Sigue el patrón de `skills/praxis-config`.

**Files:**
- Create: `skills/praxis-audit/SKILL.md`

- [ ] **Step 1: Leer la skill existente como molde**

Run: `cat skills/praxis-config/SKILL.md` (copiar estructura: frontmatter `name`/`description`, pasos, cómo invoca el `bin/`).

- [ ] **Step 2: Crear `skills/praxis-audit/SKILL.md`**

```markdown
---
name: praxis-audit
description: Audita un proyecto Next.js completo con las reglas de praxis-guard. Decide solo entre auditoría completa (cambió la versión del plugin o el código/config de las reglas) y auditoría incremental (solo el diff de git desde la última corrida). Invocar cuando el usuario dice "auditá el proyecto", "corré praxis-audit", "revisá todo el repo", o quiere chequear malas praxis fuera del flujo archivo-por-archivo del hook.
---

# praxis-audit

Motor determinista: `bin/praxis-audit.mjs`. Esta skill solo lo invoca y presenta el reporte.

## Cómo correrlo

- Auto (recomendado): `node bin/praxis-audit.mjs --dir <proyecto>`
  - Completa si cambió `plugin_version` o `rules_fingerprint`, o si no hay `last_audited_commit`.
  - Incremental (git diff desde `last_audited_commit`) en caso contrario.
- Forzar completa: `node bin/praxis-audit.mjs --full --dir <proyecto>`
- Desde un ref: `node bin/praxis-audit.mjs --since <ref> --dir <proyecto>`
- Pre-commit (lo usa el hook git): `node bin/praxis-audit.mjs --staged --dir <proyecto>`

## Flujo

1. Correr el comando auto sobre el cwd del proyecto.
2. Leer el reporte (findings agrupados por archivo + el modo usado).
3. Presentarle al usuario los findings priorizados; si hay muchos, agrupar por regla.
4. Si aparece un finding de arquitectura y el proyecto aún no declaró estrategia, sugerir `praxis-config`.

## Estado

El motor estampa en `.praxis-guard/meta.json`: `last_audited_commit`, `rules_fingerprint`, `plugin_version`. No tocar a mano.
```

- [ ] **Step 3: Verificar que el comando real corre**

Run: `node bin/praxis-audit.mjs --dir .`
Expected: imprime "sin findings" o un reporte; exit 0.

- [ ] **Step 4: Commit**

```bash
git add skills/praxis-audit/SKILL.md
git commit -m "docs(skill): praxis-audit (wrapper conversacional del auditor)"
```

---

## Task 19: Documentación (CLAUDE.md + README)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Actualizar `CLAUDE.md`**

En la línea que lista las reglas, reemplazar la enumeración por:

```
Reglas de contenido: `secrets`, `hardcoded-data`, `forbidden-imports`,
`file-responsibility`, `untranslated-text`.
Reglas de arquitectura (opt-in, requieren declarar `architecture.strategy`):
`folder-placement`, `layer-boundaries`, `server-client-boundaries`, `feature-deps`
(por-archivo) y `architecture-coherence` (solo auditoría).
```

Agregar una sección nueva:

```markdown
## Auditoría de proyecto

Además del hook por-archivo, `praxis-audit` audita el repo completo. Invocá la skill
**`praxis-audit`** (o `node bin/praxis-audit.mjs`). Decide sola:
- versión del plugin o código/config de reglas cambió → auditoría **completa**;
- si no → **incremental** sobre el git diff desde el último commit auditado.

El estado vive en `.praxis-guard/meta.json` (`last_audited_commit`, `rules_fingerprint`,
`plugin_version`, `reviewed_rules`). Si aparecen reglas sin revisar, el hook `SessionStart`
te ofrece correr `praxis-config`.

### Pre-commit
`node bin/install-hooks.mjs --target <proyecto> --cli precommit` instala un git `pre-commit`
que corre `praxis-audit --staged`. Por default **avisa sin bloquear**; activá el bloqueo con
`"commit": { "block": true, "minSeverity": "warn" }` en la config.
```

- [ ] **Step 2: Actualizar `README.md`**

Agregar bajo la lista de reglas la distinción contenido/arquitectura (mismo texto que CLAUDE.md), una subsección "Auditoría de proyecto" con los comandos de `bin/praxis-audit.mjs` y sus flags (`--full`, `--since <ref>`, `--staged`), y la instalación del pre-commit. Incluir un ejemplo de bloque `architecture` y de una regla `layer-boundaries` configurada.

- [ ] **Step 3: Verificar build/tests**

Run: `npm test`
Expected: todos los test files pasan.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: reglas de arquitectura, auditoría y pre-commit"
```

---

## Self-review (cobertura del spec)

- **A.1 dos clases de regla** → Task 1 (firma + `RULES`/`PROJECT_RULES`), Task 8 (project rule).
- **A.2 bloque `architecture`** → Task 3 (defaults + validación), leído por las reglas (Tasks 4-8).
- **A.3 reglas nuevas** → folder-placement (4), layer-boundaries (5), server-client (6), feature-deps (7), architecture-coherence (8). Todas opt-in vía Task 3.
- **A.4 relación con forbidden-imports** → no se toca; layer/feature usan `lib/imports.mjs` (Task 2) sobre paths del repo.
- **A.5 validación** → Task 3.
- **B.1 meta.json + fingerprint** → Task 9 (meta), Task 10 (fingerprint).
- **B.2 drift (Rec A)** → Task 12 (praxis-config estampa reviewed_rules), Task 17 (SessionStart avisa).
- **B.3 motor + disparadores** → Task 13 (full), Task 14 (decisión + incremental + meta), Task 15 (--staged). Flags `--full/--staged/--since` cubiertos. Degradación sin git en Task 14.
- **B.4 skill** → Task 18.
- **B.5 pre-commit configurable** → Task 15 (block/minSeverity), Task 16 (instalación).
- **Componentes / testing / riesgos** → cubiertos; batching queda fuera (YAGNI, declarado en spec).

Consistencia de nombres verificada: `RULES`/`PROJECT_RULES`, `rulesFingerprint`, `readMeta`/`writeMeta`, `enumerateFiles`/`buildProjectTree`, `matchGlob`, `extractImports`, `runFileRules`/`runProjectRules`, campos meta `last_audited_commit`/`rules_fingerprint`/`plugin_version`/`reviewed_rules`.
