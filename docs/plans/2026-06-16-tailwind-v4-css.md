# Tailwind v4 CSS-only (@theme) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las reglas Tailwind theme-aware funcionen en proyectos Tailwind v4 sin `tailwind.config.*` (theme en CSS `@theme`), detectando v4 por `package.json` + ubicando el CSS con `@theme`.

**Architecture:** `detect-stack` detecta v4 (package.json) y expone `tailwindThemeSource` (config v3 o CSS v4). `tailwind-theme.mjs` despacha: `.css` → `parseCssTheme` (regex sobre `@theme`), si no → el parser de config actual. Las 2 reglas pasan a usar `tailwindThemeSource`.

**Tech Stack:** Node ≥18 ESM, regex para CSS, TS parser para configs JS/TS (sin cambios), test runner casero.

**Spec:** `docs/specs/2026-06-16-tailwind-v4-css-design.md`

> Autobump activo (sincroniza TODOS los manifiestos por commit) — esperado.

---

## Task 1: detect-stack — v4 + `tailwindThemeSource`

**Files:**
- Modify: `lib/detect-stack.mjs`
- Test: extend `test/lib/detect-stack-tailwind.test.mjs`

- [ ] **Step 1: Extender el test (que falle)**

Reemplazar el contenido de `test/lib/detect-stack-tailwind.test.mjs` por:
```js
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack } from '../../lib/detect-stack.mjs';

// v3: config file -> tailwind + themeSource = el config
const v3 = mkdtempSync(join(tmpdir(), 'dstw3-'));
writeFileSync(join(v3, 'tailwind.config.js'), 'module.exports = {};');
const d3 = detectStack(v3);
assert.equal(d3.tailwind, true);
assert.ok(d3.tailwindConfigPath && d3.tailwindConfigPath.endsWith('tailwind.config.js'));
assert.ok(d3.tailwindThemeSource && d3.tailwindThemeSource.endsWith('tailwind.config.js'), `src=${d3.tailwindThemeSource}`);

// v4 CSS-only: tailwindcss en package.json + globals.css con @theme, SIN config
const v4 = mkdtempSync(join(tmpdir(), 'dstw4-'));
writeFileSync(join(v4, 'package.json'), JSON.stringify({ devDependencies: { tailwindcss: '^4.0.0' } }));
mkdirSync(join(v4, 'app'), { recursive: true });
writeFileSync(join(v4, 'app', 'globals.css'), '@import "tailwindcss";\n@theme { --color-brand: #1a1a1a; }');
const d4 = detectStack(v4);
assert.equal(d4.tailwind, true, 'detecta v4 por package.json');
assert.equal(d4.tailwindConfigPath, null, 'sin config file');
assert.ok(d4.tailwindThemeSource && d4.tailwindThemeSource.endsWith('globals.css'), `src=${d4.tailwindThemeSource}`);

// nada de tailwind -> false / null
const none = mkdtempSync(join(tmpdir(), 'dstw0-'));
const d0 = detectStack(none);
assert.equal(d0.tailwind, false);
assert.equal(d0.tailwindThemeSource, null);

console.log('detect-stack-tailwind.test ok');
```
Run: `node test/lib/detect-stack-tailwind.test.mjs` → FAIL (`tailwindThemeSource` undefined; v4 no detectado).

- [ ] **Step 2: Modificar `lib/detect-stack.mjs`**

Localizar la línea (de la feature anterior):
```js
  const tailwind = TAILWIND_CONFIGS.some((f) => existsSync(join(root, f)));
  const tailwindConfigPath = TAILWIND_CONFIGS.map((f) => join(root, f)).find((p) => existsSync(p)) || null;
```
Reemplazarla por:
```js
  const tailwindConfigPath = TAILWIND_CONFIGS.map((f) => join(root, f)).find((p) => existsSync(p)) || null;

  // v4: tailwindcss en package.json (deps/devDeps) — proyectos CSS-only no tienen config file.
  let hasTwDep = false;
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    hasTwDep = !!((pkg.dependencies && pkg.dependencies.tailwindcss) || (pkg.devDependencies && pkg.devDependencies.tailwindcss));
  } catch { /* sin package.json o no parseable */ }
  const tailwind = !!tailwindConfigPath || hasTwDep;

  // theme source: config (v3) o el primer CSS convencional que contenga @theme (v4).
  const CSS_THEME_CANDIDATES = ['app/globals.css', 'src/app/globals.css', 'styles/globals.css',
                                'src/index.css', 'src/styles/globals.css', 'app/styles/globals.css'];
  let tailwindThemeSource = tailwindConfigPath;
  if (!tailwindThemeSource) {
    for (const rel of CSS_THEME_CANDIDATES) {
      const p = join(root, rel);
      try { if (existsSync(p) && /@theme\b/.test(readFileSync(p, 'utf8'))) { tailwindThemeSource = p; break; } }
      catch { /* skip */ }
    }
  }
```
En el objeto de retorno, después de `tailwindConfigPath,` agregar:
```js
    tailwindThemeSource,
```
(`readFileSync` ya está importado en el archivo.)
Run → PASS.

- [ ] **Step 3: Suite + commit**

Run: `node test/run.mjs` → verde (la feature anterior usa `tailwindConfigPath`, intacto).
```bash
git add lib/detect-stack.mjs test/lib/detect-stack-tailwind.test.mjs
git commit --no-verify -m "feat(tailwind): detectar v4 (package.json) + tailwindThemeSource"
```

---

## Task 2: parser — `parseCssTheme` en `lib/tailwind-theme.mjs`

**Files:**
- Modify: `lib/tailwind-theme.mjs`
- Test: extend `test/lib/tailwind-theme.test.mjs`

- [ ] **Step 1: Extender el test (que falle)**

Agregar al final de `test/lib/tailwind-theme.test.mjs`, antes del `console.log('tailwind-theme.test ok')`:
```js
// v4: theme en CSS (@theme). `ts` se pasa pero el branch CSS no lo usa.
const cssPath = join(dir, 'globals.css');
writeFileSync(cssPath, `@import "tailwindcss";
@theme {
  --color-brand: #1A1A1A;
  --color-accent-500: #abcdef;
  --spacing-sm: 0.5rem
}`);
const tcss = parseTailwindTheme(ts, cssPath);
assert.ok(tcss, 'esperaba theme del CSS');
assert.equal(tcss.colors.get('#1a1a1a'), 'brand', 'hex normalizado, token v4 = brand');
assert.equal(tcss.colors.get('#abcdef'), 'accent-500');
assert.equal(tcss.spacing.get('0.5rem'), 'sm', 'última decl sin ; igual se parsea');
```
(El `dir` y los imports ya existen arriba en ese archivo.)
Run: `node test/lib/tailwind-theme.test.mjs` → FAIL (un `.css` no parsea como config → null o vacío).

- [ ] **Step 2: Modificar `lib/tailwind-theme.mjs`**

Agregar la función `parseCssTheme` antes de `export function parseTailwindTheme`:
```js
// Parsea el/los bloque(s) @theme { … } de un CSS v4: --color-*/--spacing-* -> tokens.
function parseCssTheme(text) {
  const colors = new Map(), spacing = new Map();
  for (const block of text.matchAll(/@theme[^{]*\{([\s\S]*?)\}/g)) {
    for (const m of block[1].matchAll(/--(color|spacing)-([A-Za-z0-9-]+)\s*:\s*([^;]+)/g)) {
      const ns = m[1], name = m[2], raw = m[3].trim();
      if (ns === 'color') colors.set(normalizeColor(raw), name);
      else spacing.set(raw, name);
    }
  }
  return { colors, spacing };
}
```
Cambiar la firma + el inicio de `parseTailwindTheme` para despachar por extensión. Reemplazar:
```js
export function parseTailwindTheme(ts, configPath) {
  let text;
  try { text = readFileSync(configPath, 'utf8'); } catch { return null; }
  let sf;
```
por:
```js
export function parseTailwindTheme(ts, source) {
  let text;
  try { text = readFileSync(source, 'utf8'); } catch { return null; }
  if (/\.css$/i.test(source)) return parseCssTheme(text);
  let sf;
```
(El resto del cuerpo —`ts.createSourceFile(source, ...)`— sigue usando `source` como nombre del archivo; si quedaba `configPath` en `createSourceFile`, renombralo a `source`.)
Run → PASS.

- [ ] **Step 3: Suite + commit**

Run: `node test/run.mjs` → verde.
```bash
git add lib/tailwind-theme.mjs test/lib/tailwind-theme.test.mjs
git commit --no-verify -m "feat(tailwind): parseCssTheme — leer @theme de v4 CSS"
```

---

## Task 3: reglas usan `tailwindThemeSource` + e2e v4

**Files:**
- Modify: `rules/tailwind-arbitrary-has-token.mjs`, `rules/tailwind-off-theme-value.mjs`
- Modify: `test/rules/tailwind-arbitrary-has-token.test.mjs`, `test/rules/tailwind-off-theme-value.test.mjs`
- Create: `test/fixtures/ast/tw-v4/{tsconfig.json,globals.css,ui.tsx}` + `test/rules/tailwind-v4-css.test.mjs`

- [ ] **Step 1: Actualizar los 2 tests de regla existentes**

En `test/rules/tailwind-arbitrary-has-token.test.mjs` y `test/rules/tailwind-off-theme-value.test.mjs`,
en el objeto `full.detected`, cambiar la clave `tailwindConfigPath: cfgPath` por `tailwindThemeSource: cfgPath`.
(Hay un solo `full` por archivo; el resto del test queda igual.)
Run los dos → FALLAN (la regla todavía lee `tailwindConfigPath`).

- [ ] **Step 2: Cambiar las 2 reglas**

En `rules/tailwind-arbitrary-has-token.mjs` y `rules/tailwind-off-theme-value.mjs`, reemplazar el bloque:
```js
  const det = full.detected || {};
  if (!det.tailwind || !det.tailwindConfigPath) return [];
  const theme = parseTailwindTheme(ctx.ts, det.tailwindConfigPath);
```
por:
```js
  const det = full.detected || {};
  if (!det.tailwind || !det.tailwindThemeSource) return [];
  const theme = parseTailwindTheme(ctx.ts, det.tailwindThemeSource);
```
Run los 2 tests actualizados → PASAN.

- [ ] **Step 3: Fixture v4 + test e2e**

`test/fixtures/ast/tw-v4/tsconfig.json`:
```json
{ "compilerOptions": { "jsx": "react-jsx", "noEmit": true, "skipLibCheck": true }, "include": ["*.tsx"] }
```
`test/fixtures/ast/tw-v4/globals.css`:
```css
@import "tailwindcss";
@theme {
  --color-brand: #1a1a1a;
}
```
`test/fixtures/ast/tw-v4/ui.tsx`:
```tsx
export const A = () => <div className="bg-[#1a1a1a]">a</div>;
```
`test/rules/tailwind-v4-css.test.mjs`:
```js
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import rule from '../../rules/tailwind-arbitrary-has-token.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, '..', 'fixtures', 'ast', 'tw-v4', 'globals.css');
const ctx = await buildContextFor('tw-v4');
const full = { detected: { tailwind: true, tailwindThemeSource: cssPath },
               rules: { 'tailwind-arbitrary-has-token': { enabled: true } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.match(out[0].message, /bg-brand/);   // leyó el token del @theme del CSS
console.log('tailwind-v4-css.test ok');
```
Run: `node test/rules/tailwind-v4-css.test.mjs` → PASS (la estrella lee el theme del CSS v4).

- [ ] **Step 4: Suite + commit**

Run: `node test/run.mjs` → verde.
```bash
git add rules/tailwind-arbitrary-has-token.mjs rules/tailwind-off-theme-value.mjs test/rules/ test/fixtures/ast/tw-v4/
git commit --no-verify -m "feat(tailwind): reglas theme-aware via tailwindThemeSource (cubre v4 CSS)"
```

---

## Task 4: Docs + cierre

**Files:**
- Modify: `AGENTS.md`, `README.md`, `skills/praxis-config/SKILL.md`

- [ ] **Step 1: Sacar el "v4 CSS-only es follow-up"**

- `README.md`: en la subsección "Theme-aware", cambiar la línea
  "Cubren v3 / config con archivo; v4 CSS-only (`@theme`) es follow-up." por
  "Cubren v3 (config file) y **v4 CSS-only** (theme en `@theme` del CSS; detección por `package.json`)."
- `AGENTS.md`: donde diga que parsean el `tailwind.config` estáticamente, agregar "o el `@theme` del CSS (v4)".
- `skills/praxis-config/SKILL.md`: ídem, una mención de que cubre v4 CSS.

- [ ] **Step 2: Suite final + commit**

Run: `node test/run.mjs` → verde.
```bash
git add AGENTS.md README.md skills/praxis-config/SKILL.md
git commit --no-verify -m "docs: Tailwind v4 CSS-only ahora cubierto (saca el follow-up)"
```

- [ ] **Step 3: Cerrar y mergear**

Invocar `todo-plugin:todo-done` para mover *"Tailwind v4 CSS-only (@theme)"* a `DONE.md`.
Luego `superpowers:finishing-a-development-branch` para `feat/tailwind-v4-css`.

---

## Self-review (cobertura del spec)

- **§A detección v4 + tailwindThemeSource** → Task 1. ✅
- **§B parseCssTheme + dispatch** → Task 2. ✅
- **§C reglas via tailwindThemeSource** → Task 3 (steps 1-2). ✅
- **§D tests (detect, parser, reglas, e2e v4)** → Tasks 1,2,3. ✅
- **§E docs (saca follow-up)** → Task 4. ✅

Sin placeholders. Firmas consistentes: `parseTailwindTheme(ts, source)` (renombrado de configPath) usado en
Tasks 2-3; `tailwindThemeSource` provisto por Task 1 y consumido por las reglas (Task 3) y sus tests.
`parseCssTheme` reusa `normalizeColor` (ya importado en tailwind-theme.mjs por el sub-proyecto B).
