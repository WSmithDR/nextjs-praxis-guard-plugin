# Tailwind theme-aware (sub-proyecto B) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer las reglas Tailwind conscientes del theme del proyecto: parsear estáticamente `tailwind.config.*` (sin ejecutar) y sugerir el token cuando un valor arbitrario lo matchea.

**Architecture:** `detect-stack` expone `tailwindConfigPath`. `lib/tailwind-theme.mjs` parsea el config con `ts.createSourceFile` → mapas `valor→token` (colors/spacing). Dos reglas `ast` (`--deep`) usan `ctx.ts` + ese path + `extractClassNames` sobre cada `.tsx`/`.jsx`.

**Tech Stack:** Node ≥18 ESM, TS compiler API (peer, solo el parser `createSourceFile`), test runner casero, helper `buildContextFor`.

**Spec:** `docs/specs/2026-06-16-tailwind-theme-aware-design.md`

> El hook `post-commit` (autobump) está activo — cada commit bumpea `plugin.json`. Esperado.

---

## Estructura de archivos

| Archivo | Acción |
|---|---|
| `lib/detect-stack.mjs` | modificar (+`tailwindConfigPath`) |
| `lib/tailwind-theme.mjs` | crear (parser) |
| `rules/tailwind-arbitrary-has-token.mjs` | crear |
| `rules/tailwind-off-theme-value.mjs` | crear |
| `rules/index.mjs` | modificar (AST_RULES += 2) |
| `lib/validate-config.mjs` | modificar (KNOWN_RULES += 2) |
| `config/defaults.json` | modificar |
| `test/lib/*` + `test/fixtures/ast/*` + `test/rules/*` | crear |
| `AGENTS.md`, `README.md`, skill praxis-config | docs |

---

## Task 1: `detect-stack` expone `tailwindConfigPath`

**Files:**
- Modify: `lib/detect-stack.mjs`
- Test: `test/lib/detect-stack-tailwind.test.mjs`

- [ ] **Step 1: Failing test** — `test/lib/detect-stack-tailwind.test.mjs`:
```js
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack } from '../../lib/detect-stack.mjs';

const dir = mkdtempSync(join(tmpdir(), 'dstw-'));
writeFileSync(join(dir, 'tailwind.config.js'), 'module.exports = {};');
const d = detectStack(dir);
assert.equal(d.tailwind, true);
assert.ok(d.tailwindConfigPath && d.tailwindConfigPath.endsWith('tailwind.config.js'), `path=${d.tailwindConfigPath}`);

// sin config -> null
const dir2 = mkdtempSync(join(tmpdir(), 'dstw0-'));
assert.equal(detectStack(dir2).tailwindConfigPath, null);
console.log('detect-stack-tailwind.test ok');
```
Run: `node test/lib/detect-stack-tailwind.test.mjs` → FAIL (`tailwindConfigPath` undefined).

- [ ] **Step 2: Modify `lib/detect-stack.mjs`**

Find `const tailwind = TAILWIND_CONFIGS.some((f) => existsSync(join(root, f)));` and add right after it:
```js
  const tailwindConfigPath = TAILWIND_CONFIGS.map((f) => join(root, f)).find((p) => existsSync(p)) || null;
```
In the returned object, after `tailwind,` add:
```js
    tailwindConfigPath,
```
Run → PASS.

- [ ] **Step 3: Commit**
```bash
git add lib/detect-stack.mjs test/lib/detect-stack-tailwind.test.mjs
git commit --no-verify -m "feat(tailwind): detect-stack expone tailwindConfigPath"
```

---

## Task 2: Parser del theme — `lib/tailwind-theme.mjs`

**Files:**
- Create: `lib/tailwind-theme.mjs`
- Test: `test/lib/tailwind-theme.test.mjs`

- [ ] **Step 1: Failing test** — `test/lib/tailwind-theme.test.mjs`:
```js
import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTailwindTheme } from '../../lib/tailwind-theme.mjs';

const dir = mkdtempSync(join(tmpdir(), 'twtheme-'));
const cfgPath = join(dir, 'tailwind.config.js');
writeFileSync(cfgPath, `
module.exports = {
  theme: {
    spacing: { gutter: '1.5rem' },
    extend: {
      colors: { brand: '#1A1A1A', accent: { 500: '#abcdef', DEFAULT: '#fefefe' } },
      spacing: { sm: '0.5rem' },
    },
  },
};
`);
const theme = parseTailwindTheme(ts, cfgPath);
assert.ok(theme, 'esperaba theme');
assert.equal(theme.colors.get('#1a1a1a'), 'brand', 'hex normalizado a minúsculas');
assert.equal(theme.colors.get('#abcdef'), 'accent-500', 'anidado -> accent-500');
assert.equal(theme.colors.get('#fefefe'), 'accent', 'DEFAULT -> accent');
assert.equal(theme.spacing.get('0.5rem'), 'sm');
assert.equal(theme.spacing.get('1.5rem'), 'gutter', 'theme.spacing además de extend');

// export default + const hop
const cfg2 = join(dir, 'tw2.js');
writeFileSync(cfg2, `const cfg = { theme: { extend: { colors: { x: '#000000' } } } }; export default cfg;`);
assert.equal(parseTailwindTheme(ts, cfg2).colors.get('#000000'), 'x');

// sin theme -> mapas vacíos (no null); archivo inexistente -> null
const cfg3 = join(dir, 'tw3.js'); writeFileSync(cfg3, 'module.exports = {};');
const t3 = parseTailwindTheme(ts, cfg3);
assert.equal(t3.colors.size, 0);
assert.equal(parseTailwindTheme(ts, join(dir, 'nope.js')), null);

console.log('tailwind-theme.test ok');
```
Run: `node test/lib/tailwind-theme.test.mjs` → FAIL (module not found).

- [ ] **Step 2: Implement** — `lib/tailwind-theme.mjs`:
```js
// lib/tailwind-theme.mjs
// Parsea (estáticamente, SIN ejecutar) el tailwind.config.* y extrae los tokens del theme
// declarados por el proyecto: { colors: Map<valor, nombre>, spacing: Map<valor, nombre> } | null.
import { readFileSync } from 'node:fs';

function normColor(v) { return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v.toLowerCase() : v.trim(); }

function unwrap(ts, e) {
  while (e && (ts.isAsExpression(e) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))) e = e.expression;
  return e;
}
function propName(ts, p) {
  const n = p.name;
  if (n && (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n))) return n.text;
  return null;
}
function getObjProp(ts, objLit, name) {
  if (!objLit) return null;
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p) && propName(ts, p) === name && ts.isObjectLiteralExpression(p.initializer)) return p.initializer;
  }
  return null;
}

// Encuentra el config object literal: export default {..} | const X={..};export default X | module.exports = {..}
function findConfigObject(ts, sf) {
  const named = new Map();
  let exportExpr = null;
  for (const node of sf.statements) {
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (d.name && ts.isIdentifier(d.name) && d.initializer) named.set(d.name.text, unwrap(ts, d.initializer));
      }
    } else if (ts.isExportAssignment(node)) {
      exportExpr = unwrap(ts, node.expression);
    } else if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
        && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(node.expression.left)
        && node.expression.left.expression.getText() === 'module'
        && node.expression.left.name.text === 'exports') {
      exportExpr = unwrap(ts, node.expression.right);
    }
  }
  if (!exportExpr) return null;
  if (ts.isObjectLiteralExpression(exportExpr)) return exportExpr;
  if (ts.isIdentifier(exportExpr)) {
    const v = named.get(exportExpr.text);
    return v && ts.isObjectLiteralExpression(v) ? v : null;
  }
  return null;
}

// Extrae un "scale" (colors/spacing) a Map<valorNormalizado, token>. Soporta 1 nivel de anidación.
function extractScale(ts, objLit, normalize) {
  const map = new Map();
  if (!objLit) return map;
  for (const p of objLit.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = propName(ts, p); if (key == null) continue;
    const init = p.initializer;
    if (ts.isStringLiteral(init)) {
      map.set(normalize(init.text), key);
    } else if (ts.isObjectLiteralExpression(init)) {
      for (const q of init.properties) {
        if (!ts.isPropertyAssignment(q) || !ts.isStringLiteral(q.initializer)) continue;
        const sub = propName(ts, q); if (sub == null) continue;
        map.set(normalize(q.initializer.text), sub === 'DEFAULT' ? key : `${key}-${sub}`);
      }
    }
  }
  return map;
}

export function parseTailwindTheme(ts, configPath) {
  let text;
  try { text = readFileSync(configPath, 'utf8'); } catch { return null; }
  let sf;
  try { sf = ts.createSourceFile(configPath, text, ts.ScriptTarget.Latest, true); } catch { return null; }
  const cfg = findConfigObject(ts, sf);
  if (!cfg) return null;
  const theme = getObjProp(ts, cfg, 'theme');
  if (!theme) return { colors: new Map(), spacing: new Map() };
  const extend = getObjProp(ts, theme, 'extend');
  const trim = (v) => v.trim();
  const colors = new Map([
    ...extractScale(ts, getObjProp(ts, theme, 'colors'), normColor),
    ...extractScale(ts, getObjProp(ts, extend, 'colors'), normColor),
  ]);
  const spacing = new Map([
    ...extractScale(ts, getObjProp(ts, theme, 'spacing'), trim),
    ...extractScale(ts, getObjProp(ts, extend, 'spacing'), trim),
  ]);
  return { colors, spacing };
}
```
Run → PASS. If `import ts from 'typescript'` doesn't give the ts object (interop), use `import * as ts from 'typescript'` in the TEST (not the lib — the lib receives `ts` as a param). Report if changed.

- [ ] **Step 3: Commit**
```bash
git add lib/tailwind-theme.mjs test/lib/tailwind-theme.test.mjs
git commit --no-verify -m "feat(tailwind): parser estático del theme (tailwind-theme.mjs)"
```

---

## Task 3: `tailwind-arbitrary-has-token` (default: true)

**Files:**
- Create: `rules/tailwind-arbitrary-has-token.mjs`
- Create: `test/fixtures/ast/tw-has-token/{tsconfig.json,tailwind.config.js,ui.tsx}`
- Test: `test/rules/tailwind-arbitrary-has-token.test.mjs`

- [ ] **Step 1: Fixtures**

`test/fixtures/ast/tw-has-token/tsconfig.json`:
```json
{ "compilerOptions": { "jsx": "react-jsx", "noEmit": true, "skipLibCheck": true }, "include": ["*.tsx"] }
```
`test/fixtures/ast/tw-has-token/tailwind.config.js`:
```js
module.exports = { theme: { extend: { colors: { brand: '#1a1a1a' } } } };
```
`test/fixtures/ast/tw-has-token/ui.tsx`:
```tsx
export const A = () => <div className="bg-[#1a1a1a] p-4">a</div>;   // matchea brand
export const B = () => <div className="bg-[#999999]">b</div>;        // no en theme
export const C = () => <div className="bg-brand">c</div>;            // ya token
```

- [ ] **Step 2: Failing test** — `test/rules/tailwind-arbitrary-has-token.test.mjs`:
```js
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import rule from '../../rules/tailwind-arbitrary-has-token.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfgPath = join(here, '..', 'fixtures', 'ast', 'tw-has-token', 'tailwind.config.js');
const ctx = await buildContextFor('tw-has-token');
const full = { detected: { tailwind: true, tailwindConfigPath: cfgPath },
               rules: { 'tailwind-arbitrary-has-token': { enabled: true } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'tailwind-arbitrary-has-token');
assert.match(out[0].message, /bg-brand/);
assert.ok(out[0].file.endsWith('ui.tsx'), `file=${out[0].file}`);

assert.equal(rule(ctx, { ...full, rules: { 'tailwind-arbitrary-has-token': { enabled: false } } }).length, 0);
// sin tailwind detectado -> 0
assert.equal(rule(ctx, { detected: {}, rules: { 'tailwind-arbitrary-has-token': { enabled: true } } }).length, 0);
console.log('tailwind-arbitrary-has-token.test ok');
```
Run → FAIL.

- [ ] **Step 3: Implement** — `rules/tailwind-arbitrary-has-token.mjs`:
```js
// rules/tailwind-arbitrary-has-token.mjs
// AST rule: un valor arbitrario `prefix-[valor]` que coincide con un token del theme del
// proyecto -> sugerir el token. Lee el theme con parseTailwindTheme (estático).
import { parseTailwindTheme } from '../lib/tailwind-theme.mjs';
import { extractClassNames } from '../lib/classname.mjs';

export const meta = { kind: 'ast' };

const COLOR = new Set(['bg','text','border','ring','from','to','via','fill','stroke','divide','outline','decoration','caret','accent']);
const SPACING = new Set(['w','h','min-w','max-w','min-h','max-h','p','px','py','pt','pr','pb','pl','m','mx','my','mt','mr','mb','ml','gap','gap-x','gap-y','space-x','space-y','inset','top','right','bottom','left','size']);
const ARB = /^(-?[a-z][a-z-]*)-\[([^\]]+)\]$/;

function categoryOf(prefix) { return COLOR.has(prefix) ? 'colors' : (SPACING.has(prefix) ? 'spacing' : null); }
function norm(cat, v) { return cat === 'colors' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v.toLowerCase() : v.trim(); }
function isJsx(p) { return /\.(tsx|jsx)$/.test(String(p)); }

export default function tailwindArbitraryHasToken(ctx, full = {}) {
  const cfg = (full.rules && full.rules['tailwind-arbitrary-has-token']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.ts) return [];
  const det = full.detected || {};
  if (!det.tailwind || !det.tailwindConfigPath) return [];
  const theme = parseTailwindTheme(ctx.ts, det.tailwindConfigPath);
  if (!theme) return [];

  const out = [];
  for (const sf of ctx.sourceFiles) {
    if (!isJsx(sf.fileName)) continue;
    for (const { value, line } of extractClassNames(sf.getFullText())) {
      for (const cls of value.split(/\s+/).filter(Boolean)) {
        const m = ARB.exec(cls);
        if (!m) continue;
        const cat = categoryOf(m[1]);
        if (!cat) continue;
        const token = theme[cat].get(norm(cat, m[2]));
        if (token) {
          out.push({
            rule: 'tailwind-arbitrary-has-token', severity: 'info', file: ctx.rel(sf.fileName), line,
            message: `Valor arbitrario "${cls}" coincide con el token "${token}" de tu theme. Usá "${m[1]}-${token}".`,
          });
        }
      }
    }
  }
  return out;
}
```
Run → PASS.

- [ ] **Step 4: Commit**
```bash
git add rules/tailwind-arbitrary-has-token.mjs test/rules/tailwind-arbitrary-has-token.test.mjs test/fixtures/ast/tw-has-token/
git commit --no-verify -m "feat(tailwind): regla tailwind-arbitrary-has-token (theme-aware)"
```

---

## Task 4: `tailwind-off-theme-value` (default: false, experimental)

**Files:**
- Create: `rules/tailwind-off-theme-value.mjs`
- Create: `test/fixtures/ast/tw-off-theme/{tsconfig.json,tailwind.config.js,ui.tsx}`
- Test: `test/rules/tailwind-off-theme-value.test.mjs`

- [ ] **Step 1: Fixtures**

`test/fixtures/ast/tw-off-theme/tsconfig.json`:
```json
{ "compilerOptions": { "jsx": "react-jsx", "noEmit": true, "skipLibCheck": true }, "include": ["*.tsx"] }
```
`test/fixtures/ast/tw-off-theme/tailwind.config.js`:
```js
module.exports = { theme: { extend: { colors: { brand: '#1a1a1a' } } } };
```
`test/fixtures/ast/tw-off-theme/ui.tsx`:
```tsx
export const A = () => <div className="bg-[#999999]">a</div>;   // no en theme -> dispara
export const B = () => <div className="bg-[#1a1a1a]">b</div>;   // en theme -> no dispara
```

- [ ] **Step 2: Failing test** — `test/rules/tailwind-off-theme-value.test.mjs`:
```js
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import rule from '../../rules/tailwind-off-theme-value.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cfgPath = join(here, '..', 'fixtures', 'ast', 'tw-off-theme', 'tailwind.config.js');
const ctx = await buildContextFor('tw-off-theme');
const full = { detected: { tailwind: true, tailwindConfigPath: cfgPath },
               rules: { 'tailwind-off-theme-value': { enabled: true } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'tailwind-off-theme-value');
assert.match(out[0].message, /#999999/);

assert.equal(rule(ctx, { ...full, rules: { 'tailwind-off-theme-value': { enabled: false } } }).length, 0);
console.log('tailwind-off-theme-value.test ok');
```
Run → FAIL.

- [ ] **Step 3: Implement** — `rules/tailwind-off-theme-value.mjs`:
```js
// rules/tailwind-off-theme-value.mjs
// AST rule (experimental, default off): valor arbitrario de color/spacing que NO está en el theme.
import { parseTailwindTheme } from '../lib/tailwind-theme.mjs';
import { extractClassNames } from '../lib/classname.mjs';

export const meta = { kind: 'ast' };

const COLOR = new Set(['bg','text','border','ring','from','to','via','fill','stroke','divide','outline','decoration','caret','accent']);
const SPACING = new Set(['w','h','min-w','max-w','min-h','max-h','p','px','py','pt','pr','pb','pl','m','mx','my','mt','mr','mb','ml','gap','gap-x','gap-y','space-x','space-y','inset','top','right','bottom','left','size']);
const ARB = /^(-?[a-z][a-z-]*)-\[([^\]]+)\]$/;

function categoryOf(prefix) { return COLOR.has(prefix) ? 'colors' : (SPACING.has(prefix) ? 'spacing' : null); }
function norm(cat, v) { return cat === 'colors' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v.toLowerCase() : v.trim(); }
function isJsx(p) { return /\.(tsx|jsx)$/.test(String(p)); }

export default function tailwindOffThemeValue(ctx, full = {}) {
  const cfg = (full.rules && full.rules['tailwind-off-theme-value']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.ts) return [];
  const det = full.detected || {};
  if (!det.tailwind || !det.tailwindConfigPath) return [];
  const theme = parseTailwindTheme(ctx.ts, det.tailwindConfigPath);
  if (!theme) return [];

  const out = [];
  for (const sf of ctx.sourceFiles) {
    if (!isJsx(sf.fileName)) continue;
    for (const { value, line } of extractClassNames(sf.getFullText())) {
      for (const cls of value.split(/\s+/).filter(Boolean)) {
        const m = ARB.exec(cls);
        if (!m) continue;
        const cat = categoryOf(m[1]);
        if (!cat) continue;
        if (!theme[cat].has(norm(cat, m[2]))) {
          out.push({
            rule: 'tailwind-off-theme-value', severity: 'info', file: ctx.rel(sf.fileName), line,
            message: `"${cls}" usa un valor que no está en tu theme. Agregalo al theme o usá un token existente.`,
          });
        }
      }
    }
  }
  return out;
}
```
Run → PASS.

- [ ] **Step 4: Commit**
```bash
git add rules/tailwind-off-theme-value.mjs test/rules/tailwind-off-theme-value.test.mjs test/fixtures/ast/tw-off-theme/
git commit --no-verify -m "feat(tailwind): regla tailwind-off-theme-value (experimental)"
```

---

## Task 5: Registro + validate-config + defaults

**Files:**
- Modify: `rules/index.mjs`, `lib/validate-config.mjs`, `config/defaults.json`
- Test: extender `test/rules/index-registry.test.mjs`, `test/lib/defaults-ast.test.mjs`

- [ ] **Step 1: Extender registro test** — en `test/rules/index-registry.test.mjs`, agregar los 2 ids al loop de ids AST:
```js
                  'prefer-satisfies', 'as-const-opportunity', 'prefer-discriminated-union', 'prefer-branded-type',
                  'tailwind-arbitrary-has-token', 'tailwind-off-theme-value']) {
```
Run → FAIL.

- [ ] **Step 2: `rules/index.mjs`** — imports tras los AST existentes:
```js
import tailwindArbitraryHasToken from './tailwind-arbitrary-has-token.mjs';
import tailwindOffThemeValue from './tailwind-off-theme-value.mjs';
```
y en `AST_RULES`, tras `prefer-branded-type`:
```js
  'tailwind-arbitrary-has-token': tailwindArbitraryHasToken,
  'tailwind-off-theme-value': tailwindOffThemeValue,
```
Run → PASS.

- [ ] **Step 3: `lib/validate-config.mjs`** — agregar los 2 ids al final de `KNOWN_RULES` (reemplazá la última línea del array para incluirlos antes del `]`):
```js
  'prefer-satisfies', 'as-const-opportunity', 'prefer-discriminated-union', 'prefer-branded-type',
  'tailwind-arbitrary-has-token', 'tailwind-off-theme-value'];
```

- [ ] **Step 4: Extender defaults test** — en `test/lib/defaults-ast.test.mjs`, agregar:
```js
assert.equal(d.rules['tailwind-arbitrary-has-token'].enabled, true);
assert.equal(d.rules['tailwind-off-theme-value'].enabled, false, 'experimental, default off');
```
Run → FAIL.

- [ ] **Step 5: `config/defaults.json`** — dentro de `"rules"`, tras la última regla AST de sub-proyecto A (`prefer-branded-type`), agregar (cuidando la coma):
```json
    "tailwind-arbitrary-has-token": { "enabled": true },
    "tailwind-off-theme-value": { "enabled": false }
```
Validar JSON: `node -e "JSON.parse(require('fs').readFileSync('config/defaults.json','utf8')); console.log('json ok')"`.
Run → PASS.

- [ ] **Step 6: Suite + end-to-end**

Run: `node test/run.mjs` → verde.
Run: `node bin/praxis-audit.mjs --full --deep --dir test/fixtures/ast/tw-has-token`
Expected: imprime un finding `tailwind-arbitrary-has-token` sugiriendo `bg-brand` (la experimental `tailwind-off-theme-value` NO aparece — `enabled:false`).
(Si crea `meta.json` bajo el fixture, NO lo agregues al commit.)

- [ ] **Step 7: Commit**
```bash
git add rules/index.mjs lib/validate-config.mjs config/defaults.json test/rules/index-registry.test.mjs test/lib/defaults-ast.test.mjs
git commit --no-verify -m "feat(tailwind): registrar las 2 reglas theme-aware + defaults"
```

---

## Task 6: Docs + cierre

**Files:**
- Modify: `AGENTS.md`, `README.md`, `skills/praxis-config/SKILL.md`

- [ ] **Step 1: `AGENTS.md`** — en el listado de reglas Tailwind, agregar:
```markdown
Más reglas Tailwind **theme-aware** (AST, `--deep`; parsean el `tailwind.config` estáticamente):
`tailwind-arbitrary-has-token` (sugiere el token del proyecto cuando un valor arbitrario lo matchea)
y `tailwind-off-theme-value` (experimental, off).
```

- [ ] **Step 2: `README.md`** — en la sección Tailwind (o la tabla AST de TS, donde encaje), sumar las 2
con su default y el alcance (solo tokens del proyecto, v3/config-file).

- [ ] **Step 3: `skills/praxis-config/SKILL.md`** — en el bloque de reglas Tailwind o AST, agregar:
```markdown
   - **Tailwind theme-aware (AST, `--deep`):** `tailwind-arbitrary-has-token` (prendida; sugiere el
     token del theme) y `tailwind-off-theme-value` (experimental, off). Parsean `tailwind.config`.
```

- [ ] **Step 4: Suite final**

Run: `node test/run.mjs` → verde.

- [ ] **Step 5: Commit**
```bash
git add AGENTS.md README.md skills/praxis-config/SKILL.md
git commit --no-verify -m "docs: reglas Tailwind theme-aware en AGENTS, README y praxis-config"
```

- [ ] **Step 6: Cerrar y mergear**

Invocar `todo-plugin:todo-done` para mover *"Tailwind theme-aware (sub-proyecto B)"* a `DONE.md`
(notando que el v4 CSS-only quedó como follow-up). Luego `superpowers:finishing-a-development-branch`
para `feat/tailwind-theme-aware`.

---

## Self-review (cobertura del spec)

- **§A detect-stack +tailwindConfigPath** → Task 1. ✅
- **§B parser tailwind-theme.mjs** → Task 2. ✅
- **§C.1 tailwind-arbitrary-has-token (on)** → Task 3. ✅
- **§C.2 tailwind-off-theme-value (off)** → Task 4. ✅
- **§D registro/validate-config/defaults** → Task 5. ✅
- **§E tests (parser + reglas pos/neg)** → Tasks 2,3,4. ✅
- **§F docs** → Task 6. ✅

Sin placeholders. Firmas consistentes: `parseTailwindTheme(ts, configPath)` definida en Task 2 y usada en
Tasks 3,4; ambas reglas usan `full.detected.tailwindConfigPath` (provisto por Task 1) + `ctx.ts` +
`extractClassNames`. Los ids coinciden entre regla, registro, defaults y tests.
