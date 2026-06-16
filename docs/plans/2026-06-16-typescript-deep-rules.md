# TypeScript a fondo (sub-proyecto A) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar 4 reglas AST de TypeScript idiomático (`prefer-satisfies`, `as-const-opportunity`, `prefer-discriminated-union`, `prefer-branded-type`) reusando la infra `ast` de Fase 2, sin plumbing nuevo.

**Architecture:** Cada regla es un archivo en `rules/` con `meta.kind='ast'` y firma `(ctx, full) => Finding[]`, recorriendo `ctx.sourceFiles` con `ctx.ts`/`ctx.checker`. Se registran en `AST_RULES`; el runner/fingerprint/validate-config ya las absorben. 2 prendidas por default, 2 experimentales apagadas.

**Tech Stack:** Node ≥18 ESM, TypeScript compiler API (peer del proyecto), test runner casero (`node test/run.mjs`), helper `test/helpers/ast.mjs` (`buildContextFor`).

**Spec:** `docs/specs/2026-06-16-typescript-deep-rules-design.md`

> Nota: el hook `post-commit` (autobump) está activo — cada commit bumpea `plugin.json`. Es esperado.

---

## Estructura de archivos

| Archivo | Acción |
|---|---|
| `rules/prefer-satisfies.mjs` | crear |
| `rules/as-const-opportunity.mjs` | crear |
| `rules/prefer-discriminated-union.mjs` | crear |
| `rules/prefer-branded-type.mjs` | crear |
| `rules/index.mjs` | modificar (AST_RULES += 4) |
| `lib/validate-config.mjs` | modificar (KNOWN_RULES += 4) |
| `config/defaults.json` | modificar |
| `test/fixtures/ast/<regla>/` ×4 | crear |
| `test/rules/*.test.mjs` ×4 + registro/defaults | crear/modificar |
| `AGENTS.md`, `README.md`, skill praxis-config | modificar |

Contrato AST rule (recordatorio): `export const meta = { kind: 'ast' }`, `export default function(ctx, full)`,
`ctx = { ts, program, checker, sourceFiles, projectDir, rel }`. Finding `{ rule, severity:'info', file, line, message }`,
línea = `sf.getLineAndCharacterOfPosition(node.getStart()).line + 1`, file = `ctx.rel(sf.fileName)`.

---

## Task 1: `prefer-satisfies`

**Files:**
- Create: `rules/prefer-satisfies.mjs`
- Create: `test/fixtures/ast/prefer-satisfies/{tsconfig.json,a.ts}`
- Test: `test/rules/prefer-satisfies.test.mjs`

- [ ] **Step 1: Fixtures**

`test/fixtures/ast/prefer-satisfies/tsconfig.json`:
```json
{ "compilerOptions": { "strict": true, "noEmit": true, "skipLibCheck": true }, "include": ["*.ts"] }
```
`test/fixtures/ast/prefer-satisfies/a.ts`:
```ts
export interface Config { mode: string; retries: number; }

// positivo: anota el tipo y pierde la inferencia angosta
export const cfg: Config = { mode: 'prod', retries: 3 };

// negativo: ya usa satisfies (no anota) -> no dispara
export const cfg2 = { mode: 'dev', retries: 1 } satisfies Config;

// negativo: anotación primitiva, no object-literal -> no dispara
export const name: string = 'x';
```

- [ ] **Step 2: Failing test** — `test/rules/prefer-satisfies.test.mjs`:
```js
import assert from 'node:assert/strict';
import rule from '../../rules/prefer-satisfies.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('prefer-satisfies');
const out = rule(ctx, { rules: { 'prefer-satisfies': { enabled: true } } });
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'prefer-satisfies');
assert.match(out[0].message, /cfg/);
assert.match(out[0].message, /satisfies Config/);

assert.equal(rule(ctx, { rules: { 'prefer-satisfies': { enabled: false } } }).length, 0);
console.log('prefer-satisfies.test ok');
```
Run: `node test/rules/prefer-satisfies.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement** — `rules/prefer-satisfies.mjs`:
```js
// rules/prefer-satisfies.mjs
// AST rule: `const x: T = { … }` con T un type con nombre -> sugerir `{ … } satisfies T`
// (preserva la inferencia angosta sin perder el chequeo). Si ya usa `satisfies`, el
// initializer es un SatisfiesExpression (no ObjectLiteral) y no dispara.
export const meta = { kind: 'ast' };

export default function preferSatisfies(ctx, full = {}) {
  const cfg = (full.rules && full.rules['prefer-satisfies']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.checker) return [];
  const minProps = cfg.minProps ?? 1;
  const { ts, sourceFiles, rel } = ctx;

  const out = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isVariableDeclaration(node) && node.type && node.initializer
          && ts.isTypeReferenceNode(node.type)
          && ts.isObjectLiteralExpression(node.initializer)
          && node.initializer.properties.length >= minProps) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        const typeName = node.type.typeName.getText();
        const varName = node.name.getText();
        out.push({
          rule: 'prefer-satisfies', severity: 'info', file: rel(sf.fileName), line: line + 1,
          message: `"${varName}" anota el tipo "${typeName}" y pierde la inferencia angosta. Considerá: const ${varName} = { … } satisfies ${typeName}.`,
        });
      }
      ts.forEachChild(node, visit);
    });
  }
  return out;
}
```
Run → PASS.

- [ ] **Step 4: Commit**
```bash
git add rules/prefer-satisfies.mjs test/rules/prefer-satisfies.test.mjs test/fixtures/ast/prefer-satisfies/
git commit --no-verify -m "feat(ast): regla prefer-satisfies"
```

---

## Task 2: `as-const-opportunity`

**Files:**
- Create: `rules/as-const-opportunity.mjs`
- Create: `test/fixtures/ast/as-const/{tsconfig.json,a.ts,b.ts}`
- Test: `test/rules/as-const-opportunity.test.mjs`

- [ ] **Step 1: Fixtures**

`test/fixtures/ast/as-const/tsconfig.json`:
```json
{ "compilerOptions": { "strict": true, "noEmit": true, "skipLibCheck": true }, "include": ["*.ts"] }
```
`test/fixtures/ast/as-const/a.ts` (positivo: array sin `as const` usado como fuente de union):
```ts
export const ROLES = ['admin', 'user', 'guest'];
export type Role = typeof ROLES[number];
```
`test/fixtures/ast/as-const/b.ts` (negativo: ya `as const`):
```ts
export const STATES = ['on', 'off'] as const;
export type State = typeof STATES[number];
```

- [ ] **Step 2: Failing test** — `test/rules/as-const-opportunity.test.mjs`:
```js
import assert from 'node:assert/strict';
import rule from '../../rules/as-const-opportunity.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('as-const');
const out = rule(ctx, { rules: { 'as-const-opportunity': { enabled: true } } });
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'as-const-opportunity');
assert.match(out[0].message, /ROLES/);
assert.ok(out[0].file.endsWith('a.ts'), `file=${out[0].file}`);

assert.equal(rule(ctx, { rules: { 'as-const-opportunity': { enabled: false } } }).length, 0);
console.log('as-const-opportunity.test ok');
```
Run → FAIL.

- [ ] **Step 3: Implement** — `rules/as-const-opportunity.mjs`:
```js
// rules/as-const-opportunity.mjs
// AST rule: `const X = [..]/{..}` SIN `as const`, referenciado por `typeof X[...]`
// (fuente de una union que se ensancha). Cross-statement -> necesita ver todo el programa.
// `as const` hace que el initializer sea un AsExpression, no un literal -> no es candidato.
export const meta = { kind: 'ast' };

export default function asConstOpportunity(ctx, full = {}) {
  const cfg = (full.rules && full.rules['as-const-opportunity']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.checker) return [];
  const { ts, sourceFiles, rel } = ctx;

  // 1. candidatos: const X = <array|object literal> (sin `as const`).
  const candidates = new Map();   // name -> { file, line }
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer
          && (ts.isArrayLiteralExpression(node.initializer) || ts.isObjectLiteralExpression(node.initializer))) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        candidates.set(node.name.text, { file: rel(sf.fileName), line: line + 1 });
      }
      ts.forEachChild(node, visit);
    });
  }
  if (!candidates.size) return [];

  // 2. usos: IndexedAccessType cuyo objectType es `typeof X` (TypeQuery).
  const used = new Set();
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isIndexedAccessTypeNode(node) && ts.isTypeQueryNode(node.objectType)) {
        const e = node.objectType.exprName;
        const id = ts.isIdentifier(e) ? e.text : (ts.isQualifiedName(e) ? e.right.text : null);
        if (id && candidates.has(id)) used.add(id);
      }
      ts.forEachChild(node, visit);
    });
  }

  const out = [];
  for (const [name, loc] of candidates) {
    if (!used.has(name)) continue;
    out.push({
      rule: 'as-const-opportunity', severity: 'info', file: loc.file, line: loc.line,
      message: `"${name}" alimenta una union (typeof ${name}[...]) pero no es 'as const'; la union se ensancha. Agregá 'as const'.`,
    });
  }
  return out;
}
```
Run → PASS.

- [ ] **Step 4: Commit**
```bash
git add rules/as-const-opportunity.mjs test/rules/as-const-opportunity.test.mjs test/fixtures/ast/as-const/
git commit --no-verify -m "feat(ast): regla as-const-opportunity"
```

---

## Task 3: `prefer-discriminated-union` (experimental, default off)

**Files:**
- Create: `rules/prefer-discriminated-union.mjs`
- Create: `test/fixtures/ast/discriminated-union/{tsconfig.json,a.ts}`
- Test: `test/rules/prefer-discriminated-union.test.mjs`

- [ ] **Step 1: Fixtures**

`test/fixtures/ast/discriminated-union/tsconfig.json`:
```json
{ "compilerOptions": { "strict": true, "noEmit": true, "skipLibCheck": true }, "include": ["*.ts"] }
```
`test/fixtures/ast/discriminated-union/a.ts`:
```ts
// positivo: union de objetos SIN discriminante literal común
interface Circle { radius: number; }
interface Square { side: number; }
export type Shape = Circle | Square;

// negativo: ya tiene discriminante `kind` con literales distintos
interface Dog { kind: 'dog'; bark: boolean; }
interface Cat { kind: 'cat'; meow: boolean; }
export type Animal = Dog | Cat;
```

- [ ] **Step 2: Failing test** — `test/rules/prefer-discriminated-union.test.mjs`:
```js
import assert from 'node:assert/strict';
import rule from '../../rules/prefer-discriminated-union.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('discriminated-union');
const cfg = { rules: { 'prefer-discriminated-union': { enabled: true, minMembers: 2 } } };
const out = rule(ctx, cfg);
assert.equal(out.length, 1, `got ${out.length}`);
assert.match(out[0].message, /Shape/);          // solo la union sin discriminante
assert.ok(!out.some((f) => /Animal/.test(f.message)), 'Animal ya tiene discriminante');

assert.equal(rule(ctx, { rules: { 'prefer-discriminated-union': { enabled: false } } }).length, 0);
console.log('prefer-discriminated-union.test ok');
```
Run → FAIL.

- [ ] **Step 3: Implement** — `rules/prefer-discriminated-union.mjs`:
```js
// rules/prefer-discriminated-union.mjs
// AST rule (experimental, default off): `type T = A | B | …` de tipos objeto SIN un campo
// discriminante (una prop común cuyo tipo es un string/number literal DISTINTO en cada miembro).
export const meta = { kind: 'ast' };

const LITERAL = (ts) => ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral;

function symType(checker, sym) {
  const decl = sym.valueDeclaration || (sym.declarations && sym.declarations[0]);
  try { return decl ? checker.getTypeOfSymbolAtLocation(sym, decl) : null; } catch { return null; }
}

function hasDiscriminant(ts, checker, memberTypes) {
  const litFlag = LITERAL(ts);
  const firstProps = memberTypes[0].getProperties().map((s) => s.getName());
  for (const name of firstProps) {
    const vals = [];
    let ok = true;
    for (const t of memberTypes) {
      const sym = t.getProperty(name);
      const pt = sym && symType(checker, sym);
      if (!pt || !(pt.flags & litFlag)) { ok = false; break; }
      vals.push(checker.typeToString(pt));
    }
    if (ok && new Set(vals).size === vals.length) return true;   // distinto en cada miembro
  }
  return false;
}

export default function preferDiscriminatedUnion(ctx, full = {}) {
  const cfg = (full.rules && full.rules['prefer-discriminated-union']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.checker) return [];
  const minMembers = cfg.minMembers ?? 2;
  const { ts, checker, sourceFiles, rel } = ctx;

  const out = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isTypeAliasDeclaration(node) && node.type && ts.isUnionTypeNode(node.type)
          && node.type.types.length >= minMembers) {
        const memberTypes = node.type.types.map((m) => checker.getTypeFromTypeNode(m));
        const allObjects = memberTypes.every((t) =>
          (t.flags & ts.TypeFlags.Object) && t.getProperties().length > 0);
        if (allObjects && !hasDiscriminant(ts, checker, memberTypes)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.name.getStart());
          out.push({
            rule: 'prefer-discriminated-union', severity: 'info', file: rel(sf.fileName), line: line + 1,
            message: `La union "${node.name.text}" no tiene un campo discriminante literal común. Un discriminated union ('kind'/'type') hace el narrowing seguro.`,
          });
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  return out;
}
```
Run → PASS. If a checker API misbehaves (e.g. `getTypeFromTypeNode`), STOP and report BLOCKED with the exact failure — do not change the detection strategy.

- [ ] **Step 4: Commit**
```bash
git add rules/prefer-discriminated-union.mjs test/rules/prefer-discriminated-union.test.mjs test/fixtures/ast/discriminated-union/
git commit --no-verify -m "feat(ast): regla prefer-discriminated-union (experimental)"
```

---

## Task 4: `prefer-branded-type` (experimental, default off)

**Files:**
- Create: `rules/prefer-branded-type.mjs`
- Create: `test/fixtures/ast/branded-type/{tsconfig.json,a.ts}`
- Test: `test/rules/prefer-branded-type.test.mjs`

- [ ] **Step 1: Fixtures**

`test/fixtures/ast/branded-type/tsconfig.json`:
```json
{ "compilerOptions": { "strict": true, "noEmit": true, "skipLibCheck": true }, "include": ["*.ts"] }
```
`test/fixtures/ast/branded-type/a.ts`:
```ts
export type UserId = string;        // positivo: primitivo + nombre de identidad
export type UserName = string;      // negativo: nombre no-identidad
export type Point = { x: number };  // negativo: no es primitivo
```

- [ ] **Step 2: Failing test** — `test/rules/prefer-branded-type.test.mjs`:
```js
import assert from 'node:assert/strict';
import rule from '../../rules/prefer-branded-type.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('branded-type');
const out = rule(ctx, { rules: { 'prefer-branded-type': { enabled: true } } });
assert.equal(out.length, 1, `got ${out.length}`);
assert.match(out[0].message, /UserId/);
assert.ok(!out.some((f) => /UserName|Point/.test(f.message)), 'solo identidades primitivas');

assert.equal(rule(ctx, { rules: { 'prefer-branded-type': { enabled: false } } }).length, 0);
console.log('prefer-branded-type.test ok');
```
Run → FAIL.

- [ ] **Step 3: Implement** — `rules/prefer-branded-type.mjs`:
```js
// rules/prefer-branded-type.mjs
// AST rule (experimental, default off): `type X = string|number|bigint` cuyo nombre sugiere
// identidad (*Id/*Token/*Key/…) -> sugerir branded type (protección nominal).
export const meta = { kind: 'ast' };

export default function preferBrandedType(ctx, full = {}) {
  const cfg = (full.rules && full.rules['prefer-branded-type']) || {};
  if (cfg.enabled === false) return [];
  if (!ctx || !ctx.checker) return [];
  let pattern;
  try { pattern = new RegExp(cfg.pattern || '(Id|Token|Key|Uuid|Hash)$'); }
  catch { pattern = /(Id|Token|Key|Uuid|Hash)$/; }
  const { ts, sourceFiles, rel } = ctx;
  const PRIMS = new Set([ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.BigIntKeyword]);

  const out = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isTypeAliasDeclaration(node) && node.name && node.type
          && PRIMS.has(node.type.kind) && pattern.test(node.name.text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.name.getStart());
        out.push({
          rule: 'prefer-branded-type', severity: 'info', file: rel(sf.fileName), line: line + 1,
          message: `El alias "${node.name.text}" es un primitivo sin protección nominal. Un branded type (${node.name.text} & { __brand: '${node.name.text}' }) evita mezclar identificadores.`,
        });
      }
      ts.forEachChild(node, visit);
    });
  }
  return out;
}
```
Run → PASS.

- [ ] **Step 4: Commit**
```bash
git add rules/prefer-branded-type.mjs test/rules/prefer-branded-type.test.mjs test/fixtures/ast/branded-type/
git commit --no-verify -m "feat(ast): regla prefer-branded-type (experimental)"
```

---

## Task 5: Registro + validate-config + defaults

**Files:**
- Modify: `rules/index.mjs`
- Modify: `lib/validate-config.mjs`
- Modify: `config/defaults.json`
- Test: `test/rules/index-registry.test.mjs` (extender), `test/lib/defaults-ast.test.mjs` (extender)

- [ ] **Step 1: Extender el test de registro** — en `test/rules/index-registry.test.mjs`, agregar al loop de ids AST los 4 nuevos. Localizar la línea con `for (const id of ['type-duplicate-shape', ...])` y reemplazarla por:
```js
for (const id of ['type-duplicate-shape', 'inline-shape-extract', 'schema-type-redeclare',
                  'prefer-satisfies', 'as-const-opportunity', 'prefer-discriminated-union', 'prefer-branded-type']) {
```
Run: `node test/rules/index-registry.test.mjs` → FAIL (los nuevos no están en AST_RULES).

- [ ] **Step 2: Modificar `rules/index.mjs`** — agregar imports después de los AST de Fase 2:
```js
import preferSatisfies from './prefer-satisfies.mjs';
import asConstOpportunity from './as-const-opportunity.mjs';
import preferDiscriminatedUnion from './prefer-discriminated-union.mjs';
import preferBrandedType from './prefer-branded-type.mjs';
```
y dentro de `AST_RULES`, después de `schema-type-redeclare`:
```js
  'prefer-satisfies': preferSatisfies,
  'as-const-opportunity': asConstOpportunity,
  'prefer-discriminated-union': preferDiscriminatedUnion,
  'prefer-branded-type': preferBrandedType,
```
Run: `node test/rules/index-registry.test.mjs` → PASS.

- [ ] **Step 3: `lib/validate-config.mjs`** — agregar los 4 ids a `KNOWN_RULES` (al final del array, antes del `]`):
```js
  'type-duplicate-shape', 'inline-shape-extract', 'schema-type-redeclare', 'magic-literal-repeated',
  'prefer-satisfies', 'as-const-opportunity', 'prefer-discriminated-union', 'prefer-branded-type'];
```
(Reemplazá la última línea del array existente para incluir los 4 nuevos. `minProps`/`minMembers` ya están en `NUMERIC_KEYS`.)

- [ ] **Step 4: Extender `test/lib/defaults-ast.test.mjs`** — agregar al array de ids verificados los 4 nuevos, y asserts de los enabled correctos. Después del bloque existente que checkea los ids de Fase 2, agregar:
```js
assert.equal(d.rules['prefer-satisfies'].enabled, true);
assert.equal(d.rules['as-const-opportunity'].enabled, true);
assert.equal(d.rules['prefer-discriminated-union'].enabled, false, 'experimental, default off');
assert.equal(d.rules['prefer-branded-type'].enabled, false, 'experimental, default off');
```
Run: `node test/lib/defaults-ast.test.mjs` → FAIL.

- [ ] **Step 5: `config/defaults.json`** — dentro de `"rules"`, después de la última regla AST de Fase 2 (`magic-literal-repeated` / `schema-type-redeclare`), agregar (cuidando la coma):
```json
    "prefer-satisfies": { "enabled": true, "minProps": 1 },
    "as-const-opportunity": { "enabled": true },
    "prefer-discriminated-union": { "enabled": false, "minMembers": 2 },
    "prefer-branded-type": { "enabled": false, "pattern": "(Id|Token|Key|Uuid|Hash)$" }
```
Validar el JSON: `node -e "JSON.parse(require('fs').readFileSync('config/defaults.json','utf8')); console.log('ok')"`.
Run: `node test/lib/defaults-ast.test.mjs` → PASS.

- [ ] **Step 6: Suite + verificación end-to-end**

Run: `node test/run.mjs` → todo verde.
Run: `node bin/praxis-audit.mjs --full --deep --dir test/fixtures/ast/prefer-satisfies`
Expected: imprime un finding `prefer-satisfies` sobre `cfg`. (Las experimentales NO aparecen — están `enabled:false`.)

- [ ] **Step 7: Commit**
```bash
git add rules/index.mjs lib/validate-config.mjs config/defaults.json test/rules/index-registry.test.mjs test/lib/defaults-ast.test.mjs
git commit --no-verify -m "feat: registrar las 4 reglas TS a fondo + defaults (2 experimentales off)"
```

---

## Task 6: Docs + cierre

**Files:**
- Modify: `AGENTS.md` (`CLAUDE.md` es symlink)
- Modify: `README.md`
- Modify: `skills/praxis-config/SKILL.md`

- [ ] **Step 1: `AGENTS.md`** — en el párrafo de reglas TypeScript con AST, agregar las 4:
```markdown
Más reglas TS con AST de "código idiomático" (también `--deep`): `prefer-satisfies` y
`as-const-opportunity` (prendidas), `prefer-discriminated-union` y `prefer-branded-type`
(experimentales, `enabled:false` por default).
```

- [ ] **Step 2: `README.md`** — en la sección de reglas TypeScript, sumar la misma mención (las 4, notando las 2 experimentales default-off).

- [ ] **Step 3: `skills/praxis-config/SKILL.md`** — en el bloque de reglas TypeScript con AST, agregar:
```markdown
   - **Idiomático (AST, --deep):** `prefer-satisfies`, `as-const-opportunity` (prendidas);
     `prefer-discriminated-union` (`minMembers`) y `prefer-branded-type` (`pattern`) — experimentales,
     prendelas a demanda.
```

- [ ] **Step 4: Suite final**

Run: `node test/run.mjs` → verde.

- [ ] **Step 5: Commit**
```bash
git add AGENTS.md README.md skills/praxis-config/SKILL.md
git commit --no-verify -m "docs: 4 reglas TS a fondo en AGENTS, README y praxis-config"
```

- [ ] **Step 6: Cerrar y mergear**

Invocar `todo-plugin:todo-done` para *"Aprovechar a fondo TS + Tailwind"* — pero **NO** cerrarla del todo: solo el sub-proyecto A está hecho; dejar la entrada con una nota de que **falta el sub-proyecto B (Tailwind theme-aware)**, o desdoblar el item en A (hecho) + B (pendiente). Luego `superpowers:finishing-a-development-branch` para `feat/typescript-deep-rules`.

---

## Self-review (cobertura del spec)

- **§A.1 prefer-satisfies** → Task 1. ✅
- **§A.2 as-const-opportunity** → Task 2. ✅
- **§A.3 prefer-discriminated-union (off)** → Task 3. ✅
- **§A.4 prefer-branded-type (off)** → Task 4. ✅
- **§B registro/validate-config/defaults** → Task 5. ✅
- **§C tests pos+neg por regla** → Tasks 1-4 (cada test tiene caso negativo). ✅
- **§D docs** → Task 6. ✅

Sin placeholders. Firmas consistentes: todas las reglas usan `(ctx, full)` con `ctx.{ts,checker,sourceFiles,rel}`
y emiten `{rule,severity:'info',file,line,message}`. Los ids coinciden entre regla, registro (Task 5), defaults
(Task 5) y tests. El item del TODO se desdobla A(hecho)/B(pendiente), no se cierra entero.
