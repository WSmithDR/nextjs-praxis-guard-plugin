# Reglas TypeScript con AST (Fase 2) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una tercera clase de regla (`ast`) que usa el type-checker de TypeScript del proyecto auditado para detectar reuso de tipos cruzando archivos, corriendo solo en la auditoría profunda (opt-in).

**Architecture:** El runner construye el "programa" TS **una sola vez** (`lib/ts-program.mjs`) y pasa un `astContext = { ts, program, checker, sourceFiles, projectDir, rel }` a cada regla AST. Las reglas son archivos independientes registrados en `AST_RULES`. `typescript` se resuelve como **peer** desde el proyecto auditado (runtime) y como **devDependency** del plugin (tests). Una cuarta regla sin AST (`magic-literal-repeated`) entra como project rule normal.

**Tech Stack:** Node ≥18 ESM, `typescript` (peer/dev), test runner casero (`node test/run.mjs`, assert/strict).

**Spec:** `docs/specs/2026-06-16-typescript-ast-rules-design.md`

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/ts-program.mjs` (crear) | `buildTsContext(projectDir, config)` → arma el programa TS una vez o `null` si TS falta/rompe. |
| `lib/ast-shapes.mjs` (crear) | Helpers puros para extraer/comparar "formas" de tipos vía checker (`shapeOf`, `shapeNames`, `isSuperset`, `sameShape`, `sameSet`). |
| `rules/type-duplicate-shape.mjs` (crear) | AST rule: type que es superset de otro → sugerir `Pick`/`Omit`. |
| `rules/inline-shape-extract.mjs` (crear) | AST rule: forma inline == named type → sugerir referenciar. |
| `rules/schema-type-redeclare.mjs` (crear) | AST rule: type a mano == keys de `z.object` → sugerir `z.infer`. |
| `rules/magic-literal-repeated.mjs` (crear) | Project rule (regex): literal repetido en N archivos → sugerir const. |
| `rules/index.mjs` (modificar) | Exportar `AST_RULES`; agregar `magic-literal-repeated` a `PROJECT_RULES`. |
| `lib/custom-rules.mjs` (modificar) | Soportar `meta.kind === 'ast'`; incluir AST ids en `BUILTIN_IDS`. |
| `bin/praxis-audit.mjs` (modificar) | Flag `--deep`/`--ast`, `runAstRules`, gating opt-in; `tree.root` para project rules. |
| `config/defaults.json` (modificar) | Defaults de las 4 reglas nuevas. |
| `test/helpers/ast.mjs` (crear) | `buildContextFor(fixtureDir, rules)` para los tests de reglas AST. |
| `test/fixtures/ast/<regla>/` (crear) | Fixtures `.ts` + `tsconfig.json` por regla. |
| `test/rules/*.test.mjs` (crear) | Un test por regla nueva + test de degradación. |
| `CLAUDE.md`, skill `praxis-audit`, `bin/praxis-config.mjs` (modificar) | Docs + menú rápida/profunda. |

---

## Task 1: Agregar `typescript` como devDependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Agregar la devDependency e instalar**

Editar `package.json` para agregar el bloque `devDependencies` después de `engines`:

```json
  "engines": { "node": ">=18" },
  "devDependencies": { "typescript": "^5.4.0" },
  "scripts": {
    "test": "node test/run.mjs",
    "detect": "node hooks/detect.mjs"
  }
```

- [ ] **Step 2: Instalar**

Run: `npm install`
Expected: crea `node_modules/typescript` y `package-lock.json` (o lo actualiza). Sin errores.

- [ ] **Step 3: Verificar que resuelve**

Run: `node -e "console.log(require.resolve('typescript'))"`
Expected: imprime una ruta a `.../node_modules/typescript/lib/typescript.js`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit --no-verify -m "build: typescript como devDependency (tests de reglas AST)"
```

---

## Task 2: Helpers de forma de tipos — `lib/ast-shapes.mjs`

**Files:**
- Create: `lib/ast-shapes.mjs`
- Test: `test/lib/ast-shapes.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lib/ast-shapes.test.mjs`:

```js
import assert from 'node:assert/strict';
import { isSuperset, sameShape, sameSet } from '../../lib/ast-shapes.mjs';

// isSuperset: big estrictamente mayor y contiene todo small
const big = new Map([['id', 'string'], ['name', 'string'], ['age', 'number']]);
const small = new Map([['id', 'string'], ['name', 'string']]);
assert.equal(isSuperset(big, small), true);
assert.equal(isSuperset(small, big), false);        // small no es superset
assert.equal(isSuperset(big, big), false);          // mismo tamaño -> no superset
// tipo distinto rompe el match
assert.equal(isSuperset(big, new Map([['id', 'number'], ['name', 'string']])), false);

// sameShape: mismas keys y tipos
assert.equal(sameShape(small, new Map([['name', 'string'], ['id', 'string']])), true);
assert.equal(sameShape(small, big), false);

// sameSet: solo nombres
assert.equal(sameSet(new Set(['a', 'b']), new Set(['b', 'a'])), true);
assert.equal(sameSet(new Set(['a']), new Set(['a', 'b'])), false);

console.log('ast-shapes.test ok');
```

- [ ] **Step 2: Correr para ver que falla**

Run: `node test/lib/ast-shapes.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/ast-shapes.mjs'`.

- [ ] **Step 3: Implementar el módulo**

Crear `lib/ast-shapes.mjs`:

```js
// lib/ast-shapes.mjs
// Helpers puros para extraer y comparar "formas" de tipos con el type-checker.

// Map<propName, typeString> de un tipo. `enclosing` es un nodo de fallback
// para resolver el tipo de cada símbolo.
export function shapeOf(ts, checker, type, enclosing) {
  const shape = new Map();
  for (const sym of checker.getPropertiesOfType(type)) {
    const decl = sym.valueDeclaration || (sym.declarations && sym.declarations[0]) || enclosing;
    let t = null;
    try { t = checker.getTypeOfSymbolAtLocation(sym, decl); } catch { t = null; }
    shape.set(sym.getName(), t ? checker.typeToString(t) : 'unknown');
  }
  return shape;
}

// Set<propName> de un tipo (sin los tipos, solo nombres).
export function shapeNames(ts, checker, type) {
  const names = new Set();
  for (const sym of checker.getPropertiesOfType(type)) names.add(sym.getName());
  return names;
}

// ¿`big` contiene TODAS las entradas (name+type) de `small` y es estrictamente mayor?
export function isSuperset(big, small) {
  if (big.size <= small.size) return false;
  for (const [k, v] of small) if (big.get(k) !== v) return false;
  return true;
}

// ¿misma forma exacta (mismas keys y tipos)?
export function sameShape(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

// ¿mismos nombres (Sets)?
export function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `node test/lib/ast-shapes.test.mjs`
Expected: PASS — imprime `ast-shapes.test ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/ast-shapes.mjs test/lib/ast-shapes.test.mjs
git commit --no-verify -m "feat(ast): helpers de forma de tipos (shapeOf/isSuperset/sameShape)"
```

---

## Task 3: Construcción del programa TS — `lib/ts-program.mjs`

**Files:**
- Create: `lib/ts-program.mjs`
- Create: `test/fixtures/ast/program/tsconfig.json`
- Create: `test/fixtures/ast/program/a.ts`
- Test: `test/lib/ts-program.test.mjs`

- [ ] **Step 1: Crear el fixture**

Crear `test/fixtures/ast/program/tsconfig.json`:

```json
{ "compilerOptions": { "strict": true, "noEmit": true, "skipLibCheck": true }, "include": ["*.ts"] }
```

Crear `test/fixtures/ast/program/a.ts`:

```ts
export interface User { id: string; name: string; }
```

- [ ] **Step 2: Escribir el test que falla**

Crear `test/lib/ts-program.test.mjs`:

```js
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTsContext } from '../../lib/ts-program.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scope = { include: ['.ts', '.tsx'], exclude: ['node_modules'] };

// 1. proyecto con tsconfig -> context válido
const ctx = await buildTsContext(join(here, '..', 'fixtures', 'ast', 'program'), scope);
assert.ok(ctx, 'esperaba un context');
assert.ok(ctx.checker, 'esperaba checker');
assert.ok(ctx.sourceFiles.some((sf) => sf.fileName.endsWith('/a.ts')), 'esperaba a.ts en sourceFiles');
assert.equal(ctx.sourceFiles.some((sf) => sf.isDeclarationFile), false, 'no debería incluir .d.ts');

// 2. dir sin tsconfig -> null (degradación)
const none = await buildTsContext(join(here, '..', 'fixtures'), scope);
assert.equal(none, null, 'sin tsconfig -> null');

console.log('ts-program.test ok');
```

- [ ] **Step 3: Correr para ver que falla**

Run: `node test/lib/ts-program.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/ts-program.mjs'`.

- [ ] **Step 4: Implementar el módulo**

Crear `lib/ts-program.mjs`:

```js
// lib/ts-program.mjs
// Construye el "programa" de TypeScript del proyecto auditado UNA sola vez.
// typescript se resuelve como PEER (del proyecto), no se bundlea. Si falta o
// algo rompe -> null (las reglas AST se saltean con degradación elegante).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { isInScope } from './scope.mjs';

export async function buildTsContext(projectDir, config = {}) {
  // 1. resolver el typescript DEL PROYECTO (walks up desde projectDir).
  let ts;
  try {
    const req = createRequire(join(projectDir, 'noop.js'));
    const mod = await import(pathToFileURL(req.resolve('typescript')).href);
    ts = mod.default || mod;
    if (typeof ts.createProgram !== 'function') return null;
  } catch { return null; }

  // 2. encontrar y parsear tsconfig.json.
  let configPath;
  try { configPath = ts.findConfigFile(projectDir, ts.sys.fileExists, 'tsconfig.json'); }
  catch { return null; }
  if (!configPath) return null;

  let parsed;
  try {
    parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
      ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {},
    });
  } catch { return null; }
  if (!parsed || !parsed.fileNames || !parsed.fileNames.length) return null;

  // 3. construir programa + checker.
  let program;
  try { program = ts.createProgram(parsed.fileNames, parsed.options); }
  catch { return null; }
  const checker = program.getTypeChecker();

  // 4. archivos in-scope (sin .d.ts ni excluidos).
  const root = projectDir.replace(/\\/g, '/').replace(/\/$/, '');
  const rel = (abs) => abs.replace(/\\/g, '/').replace(root + '/', '');
  const sourceFiles = program.getSourceFiles().filter(
    (sf) => !sf.isDeclarationFile && isInScope(rel(sf.fileName), config));

  return { ts, program, checker, sourceFiles, projectDir, rel };
}
```

- [ ] **Step 5: Correr para ver que pasa**

Run: `node test/lib/ts-program.test.mjs`
Expected: PASS — `ts-program.test ok`.

- [ ] **Step 6: Commit**

```bash
git add lib/ts-program.mjs test/lib/ts-program.test.mjs test/fixtures/ast/program/
git commit --no-verify -m "feat(ast): buildTsContext — programa TS del proyecto (peer), una sola vez"
```

---

## Task 4: Helper de tests para reglas AST — `test/helpers/ast.mjs`

**Files:**
- Create: `test/helpers/ast.mjs`

- [ ] **Step 1: Crear el helper**

Crear `test/helpers/ast.mjs`:

```js
// Helper para tests de reglas AST: arma un astContext real desde un fixture.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTsContext } from '../../lib/ts-program.mjs';

const FIXT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'ast');

// Devuelve el astContext para test/fixtures/ast/<name>/.
export async function buildContextFor(name) {
  const scope = { include: ['.ts', '.tsx'], exclude: ['node_modules'] };
  const ctx = await buildTsContext(join(FIXT, name), scope);
  if (!ctx) throw new Error(`no se pudo armar el context para fixture "${name}" (¿typescript instalado?)`);
  return ctx;
}
```

- [ ] **Step 2: Verificar que el helper carga**

Run: `node -e "import('./test/helpers/ast.mjs').then(m=>console.log(typeof m.buildContextFor))"`
Expected: imprime `function`.

- [ ] **Step 3: Commit**

```bash
git add test/helpers/ast.mjs
git commit --no-verify -m "test(ast): helper buildContextFor para fixtures"
```

---

## Task 5: Regla `type-duplicate-shape`

**Files:**
- Create: `rules/type-duplicate-shape.mjs`
- Create: `test/fixtures/ast/type-duplicate/tsconfig.json`
- Create: `test/fixtures/ast/type-duplicate/base.ts`
- Create: `test/fixtures/ast/type-duplicate/dup.ts`
- Test: `test/rules/type-duplicate-shape.test.mjs`

- [ ] **Step 1: Crear los fixtures**

Crear `test/fixtures/ast/type-duplicate/tsconfig.json`:

```json
{ "compilerOptions": { "strict": true, "noEmit": true, "skipLibCheck": true }, "include": ["*.ts"] }
```

Crear `test/fixtures/ast/type-duplicate/base.ts`:

```ts
export interface User { id: string; name: string; email: string; }
```

Crear `test/fixtures/ast/type-duplicate/dup.ts`:

```ts
export interface Contact { id: string; name: string; }
```

(`User` es superset de `Contact` → se espera 1 finding sobre `User`, sugiriendo derivar de `Contact`.)

- [ ] **Step 2: Escribir el test que falla**

Crear `test/rules/type-duplicate-shape.test.mjs`:

```js
import assert from 'node:assert/strict';
import rule from '../../rules/type-duplicate-shape.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('type-duplicate');
const full = { rules: { 'type-duplicate-shape': { enabled: true, minProps: 2 } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'type-duplicate-shape');
assert.equal(out[0].severity, 'info');
assert.ok(out[0].file.endsWith('base.ts'), `file=${out[0].file}`);
assert.match(out[0].message, /Contact/);
assert.match(out[0].message, /Pick<Contact/);

// disabled -> 0
assert.equal(rule(ctx, { rules: { 'type-duplicate-shape': { enabled: false } } }).length, 0);

console.log('type-duplicate-shape.test ok');
```

- [ ] **Step 3: Correr para ver que falla**

Run: `node test/rules/type-duplicate-shape.test.mjs`
Expected: FAIL — `Cannot find module '../../rules/type-duplicate-shape.mjs'`.

- [ ] **Step 4: Implementar la regla**

Crear `rules/type-duplicate-shape.mjs`:

```js
// rules/type-duplicate-shape.mjs
// AST rule: un type/interface es superset de otro (otro archivo) -> sugerir Pick/Omit.
import { shapeOf, isSuperset } from '../lib/ast-shapes.mjs';

export const meta = { kind: 'ast' };

export default function typeDuplicateShape(ctx, full = {}) {
  const cfg = (full.rules && full.rules['type-duplicate-shape']) || {};
  if (cfg.enabled === false) return [];
  const minProps = cfg.minProps ?? 2;
  const { ts, checker, sourceFiles, rel } = ctx;

  // 1. juntar todas las declaraciones de tipo con nombre y su forma.
  const decls = [];   // { name, file, line, shape }
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) {
        const shape = shapeOf(ts, checker, checker.getTypeAtLocation(node.name), node);
        if (shape.size >= minProps) {
          const { line } = sf.getLineAndCharacterOfPosition(node.name.getStart());
          decls.push({ name: node.name.text, file: rel(sf.fileName), line: line + 1, shape });
        }
      }
      ts.forEachChild(node, visit);
    });
  }

  // 2. para cada A, el mejor B (otro archivo) cuyo set es subset de A.
  const out = [];
  for (const a of decls) {
    let best = null;
    for (const b of decls) {
      if (b === a || b.file === a.file) continue;
      if (isSuperset(a.shape, b.shape) && (!best || b.shape.size > best.shape.size)) best = b;
    }
    if (best) {
      const keys = [...best.shape.keys()].map((k) => `'${k}'`).join(', ');
      out.push({
        rule: 'type-duplicate-shape', severity: 'info', file: a.file, line: a.line,
        message: `"${a.name}" repite las props de "${best.name}" (${best.file}). Considerá derivar: Pick<${best.name}, ${keys}> (o Omit).`,
      });
    }
  }
  return out;
}
```

- [ ] **Step 5: Correr para ver que pasa**

Run: `node test/rules/type-duplicate-shape.test.mjs`
Expected: PASS — `type-duplicate-shape.test ok`.

- [ ] **Step 6: Commit**

```bash
git add rules/type-duplicate-shape.mjs test/rules/type-duplicate-shape.test.mjs test/fixtures/ast/type-duplicate/
git commit --no-verify -m "feat(ast): regla type-duplicate-shape (Pick/Omit)"
```

---

## Task 6: Regla `inline-shape-extract`

**Files:**
- Create: `rules/inline-shape-extract.mjs`
- Create: `test/fixtures/ast/inline-shape/tsconfig.json`
- Create: `test/fixtures/ast/inline-shape/types.ts`
- Create: `test/fixtures/ast/inline-shape/use.ts`
- Test: `test/rules/inline-shape-extract.test.mjs`

- [ ] **Step 1: Crear los fixtures**

Crear `test/fixtures/ast/inline-shape/tsconfig.json`:

```json
{ "compilerOptions": { "strict": true, "noEmit": true, "skipLibCheck": true }, "include": ["*.ts"] }
```

Crear `test/fixtures/ast/inline-shape/types.ts`:

```ts
export interface Point { x: number; y: number; }
```

Crear `test/fixtures/ast/inline-shape/use.ts`:

```ts
export function move(p: { x: number; y: number }): void { void p; }
```

(El param inline `{ x: number; y: number }` coincide con `Point` → 1 finding.)

- [ ] **Step 2: Escribir el test que falla**

Crear `test/rules/inline-shape-extract.test.mjs`:

```js
import assert from 'node:assert/strict';
import rule from '../../rules/inline-shape-extract.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('inline-shape');
const full = { rules: { 'inline-shape-extract': { enabled: true, minProps: 2 } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'inline-shape-extract');
assert.ok(out[0].file.endsWith('use.ts'), `file=${out[0].file}`);
assert.match(out[0].message, /Point/);

assert.equal(rule(ctx, { rules: { 'inline-shape-extract': { enabled: false } } }).length, 0);

console.log('inline-shape-extract.test ok');
```

- [ ] **Step 3: Correr para ver que falla**

Run: `node test/rules/inline-shape-extract.test.mjs`
Expected: FAIL — `Cannot find module '../../rules/inline-shape-extract.mjs'`.

- [ ] **Step 4: Implementar la regla**

Crear `rules/inline-shape-extract.mjs`:

```js
// rules/inline-shape-extract.mjs
// AST rule: object-type inline cuya forma == un named type existente -> referenciarlo.
import { shapeOf, sameShape } from '../lib/ast-shapes.mjs';

export const meta = { kind: 'ast' };

export default function inlineShapeExtract(ctx, full = {}) {
  const cfg = (full.rules && full.rules['inline-shape-extract']) || {};
  if (cfg.enabled === false) return [];
  const minProps = cfg.minProps ?? 2;
  const { ts, checker, sourceFiles, rel } = ctx;

  // 1. catálogo de named types con su forma.
  const named = [];   // { name, shape }
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) {
        const shape = shapeOf(ts, checker, checker.getTypeAtLocation(node.name), node);
        if (shape.size >= minProps) named.push({ name: node.name.text, shape });
      }
      ts.forEachChild(node, visit);
    });
  }

  // 2. TypeLiterals inline (no el cuerpo de un `type X = {...}`) que igualen un named type.
  const out = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isTypeLiteralNode(node) && !(node.parent && ts.isTypeAliasDeclaration(node.parent))) {
        const shape = shapeOf(ts, checker, checker.getTypeAtLocation(node), node);
        if (shape.size >= minProps) {
          const match = named.find((n) => sameShape(n.shape, shape));
          if (match) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            out.push({
              rule: 'inline-shape-extract', severity: 'info', file: rel(sf.fileName), line: line + 1,
              message: `Esta forma inline coincide con el type "${match.name}". Considerá referenciarlo por nombre.`,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  return out;
}
```

- [ ] **Step 5: Correr para ver que pasa**

Run: `node test/rules/inline-shape-extract.test.mjs`
Expected: PASS — `inline-shape-extract.test ok`.

- [ ] **Step 6: Commit**

```bash
git add rules/inline-shape-extract.mjs test/rules/inline-shape-extract.test.mjs test/fixtures/ast/inline-shape/
git commit --no-verify -m "feat(ast): regla inline-shape-extract"
```

---

## Task 7: Regla `schema-type-redeclare`

**Files:**
- Create: `rules/schema-type-redeclare.mjs`
- Create: `test/fixtures/ast/schema-redeclare/tsconfig.json`
- Create: `test/fixtures/ast/schema-redeclare/schema.ts`
- Test: `test/rules/schema-type-redeclare.test.mjs`

- [ ] **Step 1: Crear los fixtures**

Crear `test/fixtures/ast/schema-redeclare/tsconfig.json`:

```json
{ "compilerOptions": { "strict": true, "noEmit": true, "skipLibCheck": true }, "include": ["*.ts"] }
```

Crear `test/fixtures/ast/schema-redeclare/schema.ts` (declaramos un stub local de `zod` para no depender del paquete):

```ts
declare const z: { object: (shape: Record<string, unknown>) => unknown; string: () => unknown; number: () => unknown; };
import 'zod';

export const UserSchema = z.object({ id: z.string(), name: z.string() });

export interface User { id: string; name: string; }
```

(`User` tiene las mismas keys que `UserSchema` → 1 finding.)

- [ ] **Step 2: Escribir el test que falla**

Crear `test/rules/schema-type-redeclare.test.mjs`:

```js
import assert from 'node:assert/strict';
import rule from '../../rules/schema-type-redeclare.mjs';
import { buildContextFor } from '../helpers/ast.mjs';

const ctx = await buildContextFor('schema-redeclare');
const full = { rules: { 'schema-type-redeclare': { enabled: true, minProps: 2 } } };

const out = rule(ctx, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'schema-type-redeclare');
assert.match(out[0].message, /UserSchema/);
assert.match(out[0].message, /z\.infer/);

assert.equal(rule(ctx, { rules: { 'schema-type-redeclare': { enabled: false } } }).length, 0);

console.log('schema-type-redeclare.test ok');
```

- [ ] **Step 3: Correr para ver que falla**

Run: `node test/rules/schema-type-redeclare.test.mjs`
Expected: FAIL — `Cannot find module '../../rules/schema-type-redeclare.mjs'`.

- [ ] **Step 4: Implementar la regla**

Crear `rules/schema-type-redeclare.mjs`:

```js
// rules/schema-type-redeclare.mjs
// AST rule: type a mano cuyas keys == las de un schema z.object -> sugerir z.infer.
// Compara por NOMBRES de propiedad (los keys del z.object literal vs el named type),
// que es determinístico y no depende de la versión de Zod.
import { shapeNames, sameSet } from '../lib/ast-shapes.mjs';

export const meta = { kind: 'ast' };

export default function schemaTypeRedeclare(ctx, full = {}) {
  const cfg = (full.rules && full.rules['schema-type-redeclare']) || {};
  if (cfg.enabled === false) return [];
  const minProps = cfg.minProps ?? 2;
  const { ts, checker, sourceFiles, rel } = ctx;

  // 0. ¿el proyecto importa zod? si no, no-op.
  const usesZod = sourceFiles.some((sf) =>
    sf.statements.some((s) => ts.isImportDeclaration(s)
      && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === 'zod'));
  if (!usesZod) return [];

  // 1. schemas: const X = z.object({...}) -> { name, keys:Set }
  const schemas = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer) {
        const keys = zObjectKeys(ts, node.initializer);
        if (keys && keys.size >= minProps) schemas.push({ name: node.name.text, keys });
      }
      ts.forEachChild(node, visit);
    });
  }
  if (!schemas.length) return [];

  // 2. named types cuyo set de nombres == el de un schema.
  const out = [];
  for (const sf of sourceFiles) {
    ts.forEachChild(sf, function visit(node) {
      if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) {
        const names = shapeNames(ts, checker, checker.getTypeAtLocation(node.name));
        if (names.size >= minProps) {
          const match = schemas.find((s) => sameSet(s.keys, names));
          if (match) {
            const { line } = sf.getLineAndCharacterOfPosition(node.name.getStart());
            out.push({
              rule: 'schema-type-redeclare', severity: 'info', file: rel(sf.fileName), line: line + 1,
              message: `El type "${node.name.text}" duplica la forma del schema "${match.name}". Considerá: type ${node.name.text} = z.infer<typeof ${match.name}>.`,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  return out;
}

// keys de un z.object({...}), soportando encadenados (.partial(), .optional(), etc).
function zObjectKeys(ts, expr) {
  let e = expr;
  while (e && ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
    if (e.expression.name.text === 'object'
        && e.arguments[0] && ts.isObjectLiteralExpression(e.arguments[0])) {
      const set = new Set();
      for (const p of e.arguments[0].properties) {
        if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
            && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
          set.add(p.name.text);
        }
      }
      return set;
    }
    e = e.expression.expression;   // bajar al receptor (antes del .partial(), etc)
  }
  return null;
}
```

- [ ] **Step 5: Correr para ver que pasa**

Run: `node test/rules/schema-type-redeclare.test.mjs`
Expected: PASS — `schema-type-redeclare.test ok`.

- [ ] **Step 6: Commit**

```bash
git add rules/schema-type-redeclare.mjs test/rules/schema-type-redeclare.test.mjs test/fixtures/ast/schema-redeclare/
git commit --no-verify -m "feat(ast): regla schema-type-redeclare (z.infer)"
```

---

## Task 8: Regla `magic-literal-repeated` (project rule, sin AST)

**Files:**
- Create: `rules/magic-literal-repeated.mjs`
- Test: `test/rules/magic-literal-repeated.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/rules/magic-literal-repeated.test.mjs` (usa un fixture inline escrito a tmp para no depender del FS del repo):

```js
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import rule from '../../rules/magic-literal-repeated.mjs';

const root = mkdtempSync(join(tmpdir(), 'mlr-'));
mkdirSync(join(root, 'src'), { recursive: true });
writeFileSync(join(root, 'src', 'a.ts'), 'const t = fetch("https://api.example.com");\n');
writeFileSync(join(root, 'src', 'b.ts'), 'const u = post("https://api.example.com");\n');
writeFileSync(join(root, 'src', 'c.ts'), 'const v = del("https://api.example.com");\n');

const tree = { files: ['src/a.ts', 'src/b.ts', 'src/c.ts'], dirs: new Set(['src']), root };
const full = { rules: { 'magic-literal-repeated': { enabled: true, minFiles: 3, minLen: 4 } } };

const out = rule(tree, full);
assert.equal(out.length, 1, `got ${out.length}`);
assert.equal(out[0].rule, 'magic-literal-repeated');
assert.match(out[0].message, /api\.example\.com/);

// minFiles 4 -> 0 (solo aparece en 3)
assert.equal(rule(tree, { rules: { 'magic-literal-repeated': { enabled: true, minFiles: 4 } } }).length, 0);
// disabled -> 0
assert.equal(rule(tree, { rules: { 'magic-literal-repeated': { enabled: false } } }).length, 0);

console.log('magic-literal-repeated.test ok');
```

- [ ] **Step 2: Correr para ver que falla**

Run: `node test/rules/magic-literal-repeated.test.mjs`
Expected: FAIL — `Cannot find module '../../rules/magic-literal-repeated.mjs'`.

- [ ] **Step 3: Implementar la regla**

Crear `rules/magic-literal-repeated.mjs`:

```js
// rules/magic-literal-repeated.mjs
// Project rule (regex, sin AST): un literal (string >= minLen, o número >= 3 dígitos)
// repetido en >= minFiles archivos distintos -> sugerir extraerlo a una const.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const meta = { kind: 'project' };

const SRC_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

export default function magicLiteralRepeated(tree, full = {}) {
  const cfg = (full.rules && full.rules['magic-literal-repeated']) || {};
  if (cfg.enabled === false) return [];
  const minFiles = cfg.minFiles ?? 3;
  const minLen = cfg.minLen ?? 4;
  const root = tree && tree.root;
  if (!root) return [];

  const files = (tree.files || []).filter((f) => SRC_RE.test(f));
  const occ = new Map();   // literal -> Map<file, firstLine>
  for (const rel of files) {
    let text;
    try { text = readFileSync(join(root, rel), 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const lit of literalsIn(lines[i], minLen)) {
        if (!occ.has(lit)) occ.set(lit, new Map());
        const m = occ.get(lit);
        if (!m.has(rel)) m.set(rel, i + 1);
      }
    }
  }

  const out = [];
  for (const [lit, m] of occ) {
    if (m.size >= minFiles) {
      const [firstFile, firstLine] = [...m.entries()][0];
      out.push({
        rule: 'magic-literal-repeated', severity: 'info', file: firstFile, line: firstLine,
        message: `El literal ${lit} aparece en ${m.size} archivos. Considerá extraerlo a una constante compartida.`,
      });
    }
  }
  return out;
}

// literales de una línea: strings con comillas (>= minLen) y números (>= 3 dígitos).
function literalsIn(line, minLen) {
  const out = [];
  const strRe = new RegExp(`(['"\`])((?:[^'"\\\`\\\\]|\\\\.){${minLen},})\\1`, 'g');
  let m;
  while ((m = strRe.exec(line)) !== null) out.push(`${m[1]}${m[2]}${m[1]}`);
  const numRe = /(?<![\w.])\d{3,}(?![\w.])/g;
  while ((m = numRe.exec(line)) !== null) out.push(m[0]);
  return out;
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `node test/rules/magic-literal-repeated.test.mjs`
Expected: PASS — `magic-literal-repeated.test ok`.

- [ ] **Step 5: Commit**

```bash
git add rules/magic-literal-repeated.mjs test/rules/magic-literal-repeated.test.mjs
git commit --no-verify -m "feat: regla magic-literal-repeated (project rule)"
```

---

## Task 9: Registrar reglas en `rules/index.mjs`

**Files:**
- Modify: `rules/index.mjs`
- Test: `test/rules/index-registry.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/rules/index-registry.test.mjs`:

```js
import assert from 'node:assert/strict';
import { AST_RULES, PROJECT_RULES } from '../../rules/index.mjs';

for (const id of ['type-duplicate-shape', 'inline-shape-extract', 'schema-type-redeclare']) {
  assert.equal(typeof AST_RULES[id], 'function', `AST_RULES[${id}]`);
}
assert.equal(typeof PROJECT_RULES['magic-literal-repeated'], 'function', 'magic-literal en PROJECT_RULES');

console.log('index-registry.test ok');
```

- [ ] **Step 2: Correr para ver que falla**

Run: `node test/rules/index-registry.test.mjs`
Expected: FAIL — `AST_RULES` es `undefined` → AssertionError.

- [ ] **Step 3: Modificar `rules/index.mjs`**

Agregar imports después de la línea 20 (`import tailwindDuplicateUtilities ...`):

```js
import typeDuplicateShape from './type-duplicate-shape.mjs';
import inlineShapeExtract from './inline-shape-extract.mjs';
import schemaTypeRedeclare from './schema-type-redeclare.mjs';
import magicLiteralRepeated from './magic-literal-repeated.mjs';
```

Agregar `magic-literal-repeated` dentro de `PROJECT_RULES` (después de `tsconfig-strictness`):

```js
export const PROJECT_RULES = {
  'architecture-coherence': architectureCoherence,
  'tsconfig-strictness': tsconfigStrictness,
  'magic-literal-repeated': magicLiteralRepeated,
};
```

Agregar el nuevo bloque `AST_RULES` al final del archivo:

```js
// AST rules: (astContext, fullConfig) => Finding[]
// Corren SOLO en la auditoría profunda (--deep / runOn:'full'). Usan el type-checker.
export const AST_RULES = {
  'type-duplicate-shape': typeDuplicateShape,
  'inline-shape-extract': inlineShapeExtract,
  'schema-type-redeclare': schemaTypeRedeclare,
};
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `node test/rules/index-registry.test.mjs`
Expected: PASS — `index-registry.test ok`.

- [ ] **Step 5: Commit**

```bash
git add rules/index.mjs test/rules/index-registry.test.mjs
git commit --no-verify -m "feat: registrar AST_RULES y magic-literal-repeated"
```

---

## Task 10: Soporte de `kind: 'ast'` en el loader de reglas custom

**Files:**
- Modify: `lib/custom-rules.mjs`
- Test: `test/lib/custom-rules-ast.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lib/custom-rules-ast.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCustomRules } from '../../lib/custom-rules.mjs';

const dir = mkdtempSync(join(tmpdir(), 'crast-'));
const rulesDir = join(dir, '.praxis-guard', 'rules');
mkdirSync(rulesDir, { recursive: true });
writeFileSync(join(rulesDir, 'my-ast.mjs'),
  "export const meta = { kind: 'ast' };\nexport default function () { return []; }\n");

const out = await loadCustomRules(dir);
assert.equal(typeof out.astRules['my-ast'], 'function', 'my-ast en astRules');
assert.equal(out.fileRules['my-ast'], undefined, 'no debe estar en fileRules');

// colisión con built-in AST -> error
mkdirSync(rulesDir, { recursive: true });
writeFileSync(join(rulesDir, 'type-duplicate-shape.mjs'), 'export default function(){return [];}');
const out2 = await loadCustomRules(dir);
assert.ok(out2.errors.some((e) => e.id === 'type-duplicate-shape'), 'esperaba error de colisión');

console.log('custom-rules-ast.test ok');
```

- [ ] **Step 2: Correr para ver que falla**

Run: `node test/lib/custom-rules-ast.test.mjs`
Expected: FAIL — `out.astRules` es `undefined` → AssertionError.

- [ ] **Step 3: Modificar `lib/custom-rules.mjs`**

Cambiar el import de la línea 5 para traer también `AST_RULES`:

```js
import { RULES, PROJECT_RULES, AST_RULES } from '../rules/index.mjs';
```

Cambiar `BUILTIN_IDS` (línea 7) para incluir los ids AST:

```js
const BUILTIN_IDS = new Set([...Object.keys(RULES), ...Object.keys(PROJECT_RULES), ...Object.keys(AST_RULES)]);
```

Cambiar el objeto inicial `out` (línea 13) para incluir `astRules`:

```js
  const out = { fileRules: {}, projectRules: {}, astRules: {}, errors: [] };
```

Reemplazar el bloque de clasificación por `kind` (líneas 25-27):

```js
    const kind = mod.meta && mod.meta.kind;
    if (kind === 'ast') out.astRules[id] = mod.default;
    else if (kind === 'project') out.projectRules[id] = mod.default;
    else out.fileRules[id] = mod.default;
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `node test/lib/custom-rules-ast.test.mjs`
Expected: PASS — `custom-rules-ast.test ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/custom-rules.mjs test/lib/custom-rules-ast.test.mjs
git commit --no-verify -m "feat: loader soporta reglas custom kind:'ast'"
```

---

## Task 11: Integrar las AST rules en el runner

**Files:**
- Modify: `bin/praxis-audit.mjs`

- [ ] **Step 1: Importar lo nuevo**

En `bin/praxis-audit.mjs`, cambiar el import de la línea 14:

```js
import { PROJECT_RULES, AST_RULES } from '../rules/index.mjs';
```

Agregar un import nuevo después de la línea 17 (`import { detectStack } ...`):

```js
import { buildTsContext } from '../lib/ts-program.mjs';
```

- [ ] **Step 2: Pasar `root` a las project rules**

En `runProjectRules` (línea 116), agregar `tree.root` para que `magic-literal-repeated` pueda leer archivos:

```js
function runProjectRules() {
  const tree = buildProjectTree(enumerateFiles(dir, config));
  tree.root = dir;
  const findings = [];
```

- [ ] **Step 3: Agregar `runAstRules` y `anyAstRunsOnFull`**

Insertar estas dos funciones justo después de `runProjectRules` (después de la línea 125):

```js
function anyAstRunsOnFull() {
  return Object.keys({ ...custom.astRules, ...AST_RULES }).some((id) => {
    const rc = (config.rules && config.rules[id]) || {};
    return rc.enabled !== false && rc.runOn === 'full';
  });
}

async function runAstRules() {
  const astCtx = await buildTsContext(dir, config);
  if (!astCtx) {
    console.log('praxis-audit: reglas AST omitidas — typescript no está instalado en el proyecto.');
    return [];
  }
  const findings = [];
  for (const [id, fn] of Object.entries({ ...custom.astRules, ...AST_RULES })) {
    const rc = (config.rules && config.rules[id]) || {};
    if (rc.enabled === false) continue;
    try { for (const f of fn(astCtx, config)) findings.push({ ...f, file: f.file || '(proyecto)' }); }
    catch { /* una regla rota nunca rompe la auditoría */ }
  }
  return findings;
}
```

- [ ] **Step 4: Disparar las AST rules tras computar `findings`**

Después del bloque que arma `findings` por modo (después de la línea 171, antes de `const baseline = ...`), insertar:

```js
const deep = process.argv.includes('--deep') || process.argv.includes('--ast');
if (deep || (mode === 'full' && anyAstRunsOnFull())) {
  findings = [...findings, ...await runAstRules()];
}
```

- [ ] **Step 5: Verificar manualmente sobre un fixture**

Run:
```bash
node bin/praxis-audit.mjs --full --deep --dir test/fixtures/ast/type-duplicate
```
Expected: imprime un finding `type-duplicate-shape` sobre `base.ts` mencionando `Contact` / `Pick<Contact, ...>`, y la línea final `praxis-audit: modo full (con project rules).`

- [ ] **Step 6: Verificar degradación sin `--deep`**

Run:
```bash
node bin/praxis-audit.mjs --full --dir test/fixtures/ast/type-duplicate
```
Expected: NO aparece el finding `type-duplicate-shape` (sin `--deep` las AST rules no corren).

- [ ] **Step 7: Commit**

```bash
git add bin/praxis-audit.mjs
git commit --no-verify -m "feat: runner corre AST rules con --deep / runOn:'full'"
```

---

## Task 12: Defaults de config

**Files:**
- Modify: `config/defaults.json`
- Test: `test/lib/defaults-ast.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lib/defaults-ast.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const d = JSON.parse(readFileSync(join(root, 'config', 'defaults.json'), 'utf8'));

for (const id of ['type-duplicate-shape', 'inline-shape-extract', 'schema-type-redeclare', 'magic-literal-repeated']) {
  assert.ok(d.rules[id], `falta default de ${id}`);
  assert.equal(d.rules[id].enabled, true, `${id} debe arrancar enabled`);
}
assert.equal(d.rules['type-duplicate-shape'].minProps, 2);
assert.equal(d.rules['magic-literal-repeated'].minFiles, 3);

console.log('defaults-ast.test ok');
```

- [ ] **Step 2: Correr para ver que falla**

Run: `node test/lib/defaults-ast.test.mjs`
Expected: FAIL — `falta default de type-duplicate-shape`.

- [ ] **Step 3: Modificar `config/defaults.json`**

Dentro de `"rules"`, después de `"tailwind-duplicate-utilities": { "enabled": true }`, agregar (cuidando la coma antes):

```json
    "tailwind-duplicate-utilities": { "enabled": true },
    "type-duplicate-shape": { "enabled": true, "minProps": 2 },
    "inline-shape-extract": { "enabled": true, "minProps": 2 },
    "schema-type-redeclare": { "enabled": true, "minProps": 2 },
    "magic-literal-repeated": { "enabled": true, "minFiles": 3, "minLen": 4 }
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `node test/lib/defaults-ast.test.mjs`
Expected: PASS — `defaults-ast.test ok`.

- [ ] **Step 5: Commit**

```bash
git add config/defaults.json test/lib/defaults-ast.test.mjs
git commit --no-verify -m "feat: defaults de las reglas AST + magic-literal-repeated"
```

---

## Task 13: Suite completa verde

**Files:**
- (ninguno — verificación)

- [ ] **Step 1: Correr toda la suite**

Run: `npm test`
Expected: `N/N test files passed` con N ≥ 58 (los 51 previos + los 7 nuevos). Exit 0.

- [ ] **Step 2: Si algo falla, arreglar antes de seguir**

Revisar el archivo que falló, corregir, re-correr `npm test`. No avanzar con la suite roja.

- [ ] **Step 3: Commit (si hubo arreglos)**

```bash
git add -A
git commit --no-verify -m "test: suite completa verde con reglas AST"
```

---

## Task 14: Documentación + menú rápida/profunda

**Files:**
- Modify: `CLAUDE.md`
- Modify: skill `praxis-audit` (`skills/praxis-audit/SKILL.md` o equivalente — localizar con `git grep -l "praxis-audit" skills/`)
- Modify: `bin/praxis-config.mjs`

- [ ] **Step 1: Localizar la skill y el config CLI**

Run:
```bash
git grep -l "praxis-audit" skills/ ; ls bin/
```
Expected: lista el SKILL.md de la skill `praxis-audit` y confirma `bin/praxis-config.mjs`.

- [ ] **Step 2: Actualizar `CLAUDE.md`**

En el párrafo de reglas TypeScript, agregar la mención de la Fase 2. Reemplazar la oración que enumera las reglas TS por una que agregue:

> Reglas TypeScript con AST (modo profundo `--deep`, requieren `typescript` en el proyecto):
> `type-duplicate-shape` (Pick/Omit), `inline-shape-extract`, `schema-type-redeclare` (z.infer).
> Más `magic-literal-repeated` (project rule). Corren solo en la auditoría profunda.

En la sección "Auditoría de proyecto", agregar:

> El modo **profundo** (`praxis-audit --deep`) corre además las reglas AST de reuso de tipos
> (lento: arma el programa TS). La skill `praxis-audit` te ofrece elegir rápida/profunda.

- [ ] **Step 3: Actualizar la skill `praxis-audit`**

En el SKILL.md, agregar un paso de menú antes de invocar `bin/praxis-audit.mjs`:

```markdown
## Profundidad

Antes de auditar, preguntá al usuario qué tan profundo:
1. **Rápida** — reglas de contenido/arquitectura/TS heurísticas (segundos). Corre `node bin/praxis-audit.mjs`.
2. **Profunda** — además análisis de tipos cruzando archivos (Pick/Omit, derivación). Corre `node bin/praxis-audit.mjs --deep`. Más lenta; requiere `typescript` instalado en el proyecto.

Si el proyecto tiene `tsconfig.json` y nunca se corrió la profunda, destacá la opción 2.
```

- [ ] **Step 4: Actualizar `bin/praxis-config.mjs`**

Localizar la lista de reglas que el config CLI ofrece (buscar el array/objeto de rule ids) y agregar las 4 nuevas con sus parámetros (`minProps` para las AST; `minFiles`/`minLen` para magic-literal), más el parámetro opcional `runOn` (`'deep'` | `'full'`) documentado para las AST. Seguir el patrón exacto de las reglas TS existentes en ese archivo (p. ej. cómo se ofrece `stringly-typed` con `minLiterals`).

- [ ] **Step 5: Verificar que el config CLI corre sin romper**

Run: `node bin/praxis-config.mjs --help 2>/dev/null || node bin/praxis-config.mjs`
Expected: corre sin excepción (el flujo interactivo puede requerir input; basta confirmar que no tira error de parseo al arrancar).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md skills/ bin/praxis-config.mjs
git commit --no-verify -m "docs: reglas AST (modo profundo) en CLAUDE.md, skill y praxis-config"
```

---

## Task 15: Cerrar la tarea y la rama

**Files:**
- Modify: `.todo/TODO.md` (vía skill `todo-done`)

- [ ] **Step 1: Marcar la tarea como hecha**

Invocar la skill `todo-plugin:todo-done` para mover *"Fase 2 TS con AST (Pick/Omit/derivación de tipos)"* de `TODO.md` a `DONE.md`, atribuida a quien implementó.

- [ ] **Step 2: Correr la suite una última vez**

Run: `npm test`
Expected: todo verde, exit 0.

- [ ] **Step 3: Finalizar la rama**

Invocar la skill `superpowers:finishing-a-development-branch` para decidir merge / PR de `feat/typescript-ast-rules`.

---

## Self-review (cobertura del spec)

- **§A clase `ast` + `astContext`** → Tasks 3, 9, 11. ✅
- **§B `buildTsContext` peer + degradación** → Task 3 (incluye test de `null`). ✅
- **§C runner opt-in `--deep` / `runOn:'full'`** → Task 11 (steps 3-4 + verificación 5-6). ✅
- **§D custom `kind:'ast'`** → Task 10. ✅
- **§E menú skill + flag interno** → Task 14 (steps 3). ✅
- **§F tres reglas AST** → Tasks 5, 6, 7. ✅
- **§F.4 / §G `magic-literal-repeated`** → Task 8 + Task 9 (PROJECT_RULES). ✅
- **§G defaults `enabled:true`** → Task 12. ✅
- **§H `typescript` devDependency + tests + degradación** → Tasks 1, 3, y tests por regla. ✅
- **§I docs** → Task 14. ✅

Sin placeholders. Firmas consistentes: `astContext` se crea en Task 3 con `{ ts, program, checker, sourceFiles, projectDir, rel }` y se consume con esos mismos nombres en Tasks 5-7 y 11. Helpers (`shapeOf/shapeNames/isSuperset/sameShape/sameSet`) definidos en Task 2 y usados con la misma firma después.
