# TypeScript a fondo — "código bien logrado" (sub-proyecto A) — Diseño

> Diseño aprobado — 2026-06-16. Profundiza el grupo `typescript` con reglas AST que **empujan
> hacia código idiomático** (no duplican ESLint/tsc): aprovechar `satisfies`, `as const`,
> discriminated unions y branded types. Continuación de la Fase 2 (reusa toda su infra `ast`).
> Es el **sub-proyecto A** de "Aprovechar a fondo TS + Tailwind"; el B (Tailwind theme-aware)
> es un sub-proyecto aparte, futuro.

## Objetivo

Las reglas AST de Fase 2 detectan **reuso** de tipos. Esta iteración suma reglas que sugieren
**bondades del sistema de tipos desaprovechadas** — las que ningún linter estándar propone:

1. **`prefer-satisfies`** — `const X: T = { … }` donde la anotación ensancha los literales →
   sugerir `const X = { … } satisfies T` (preserva la inferencia angosta, valida igual).
2. **`as-const-opportunity`** — array/objeto literal usado como **fuente de una union**
   (`typeof X[number]` / `typeof X[keyof typeof X]`) **sin** `as const` → la union sale ensanchada.
3. **`prefer-discriminated-union`** _(experimental, default off)_ — union de tipos objeto sin un
   campo discriminante literal común → sugerir agregar uno.
4. **`prefer-branded-type`** _(experimental, default off)_ — alias de primitivo con nombre de
   identidad (`*Id`/`*Token`/`*Key`) → sugerir branded type.

## Decisiones (de la divergencia)

| Decisión | Elección |
|---|---|
| Set de reglas | `prefer-satisfies`, `as-const-opportunity`, `prefer-discriminated-union`, `prefer-branded-type` |
| `redundant-type-annotation` | **descartada** — es `no-inferrable-types` de typescript-eslint (duplicaría ESLint, contra el principio del plugin) |
| Solape `as-const` | regla AST con id **nuevo** (`as-const-opportunity`); la `prefer-as-const` de Fase 1 (regex/hook) queda intacta |
| Defaults | 2 sólidas `enabled: true`; 2 experimentales `enabled: false` (opt-in) |
| Clase / nivel | todas `ast`, severidad `info`, solo en `--deep` / `runOn:'full'` |
| Infra | **cero plumbing nuevo** — reusa Fase 2 (buildTsContext, AST_RULES, runner, fingerprint, validate-config) |

## No-objetivos (YAGNI / honestidad)

- **`redundant-type-annotation` / `no-explicit-any` / etc.** — territorio de ESLint, descartadas por diseño.
- **Regla `enum → union`** — más opinada/ruidosa y typescript-eslint tiene algo cerca; eventual experimental.
- **Fixer automático** — las reglas solo sugieren (`info`).
- **Tailwind theme-aware** — sub-proyecto B, fuera de este spec.

---

## A. Reglas (detección)

Todas: `export const meta = { kind: 'ast' }`, `(ctx, full) => Finding[]`, guard `if (!ctx || !ctx.checker) return []`,
gating `cfg.enabled === false`, `severity: 'info'`, línea vía `getLineAndCharacterOfPosition(node...getStart())+1`,
`file` vía `ctx.rel(sf.fileName)`. Reusan helpers de `lib/ast-shapes.mjs` donde aplique.

### A.1 `prefer-satisfies` (default: true)
Para cada `VariableDeclaration` con **anotación de tipo** `T` y **initializer object-literal**
(`const x: T = { … }`): si `T` es un **type reference con nombre** (interface/type alias) — el caso
donde `satisfies` preserva la forma angosta sin perder el chequeo — emitir sobre la declaración:

> `"x" anota el tipo y pierde la inferencia angosta. Considerá: const x = { … } satisfies T.`

Conservador: solo object-literals con anotación de type-reference (no primitivos, no arrays de
escalares). Config: `minProps` (default 1).

### A.2 `as-const-opportunity` (default: true)
Caso de alta confianza que el regex de Fase 1 no ve (cross-statement): un `const X = [ …literales… ]`
o `const X = { …literales… }` **sin** `as const`, **referenciado** por un `typeof X[number]` o
`typeof X[keyof typeof X]` en una `TypeQuery`/indexed-access del proyecto. Sin `as const`, esa union
se ensancha a `string`/`number`. Emitir sobre la declaración de `X`:

> `"X" alimenta una union (typeof X[...]) pero no es 'as const'; la union se ensancha. Agregá 'as const'.`

Detección: (1) juntar las declaraciones `const X = <array|object literal>` sin `as const`; (2) buscar
en los source files un indexed-access sobre `typeof X`; (3) emitir para las que matcheen.

### A.3 `prefer-discriminated-union` (default: false, experimental)
Para cada `type T = A | B | …` (TypeAlias cuyo tipo es un `UnionType` de ≥2 miembros que son todos
tipos objeto con ≥`minProps` props): si **no** comparten una propiedad común cuyo tipo sea un
**string-literal distinto** en cada miembro (= no hay discriminante), emitir:

> `La union "T" no tiene un campo discriminante literal común. Un discriminated union ('kind'/'type') hace el narrowing seguro.`

Conservador y default-off (la heurística "convendría un discriminante" puede errar). Config: `minMembers` (default 2).

### A.4 `prefer-branded-type` (default: false, experimental)
Para cada `type X = string | number | bigint` (alias directo de primitivo) cuyo **nombre** matchee
`/(Id|Token|Key|Uuid|Hash)$/`: emitir:

> `El alias "X" es un primitivo sin protección nominal. Un branded type (X & { __brand: 'X' }) evita mezclar identificadores.`

Heurística de nombre, nicho, default-off. Config: `pattern` (regex como string, default `(Id|Token|Key|Uuid|Hash)$`).

---

## B. Registro y config

- `rules/index.mjs`: importar las 4 y agregarlas a `AST_RULES`.
- `lib/custom-rules.mjs`, `bin/praxis-audit.mjs`, `lib/fingerprint.mjs`, `bin/praxis-config.mjs`:
  **sin cambios** — ya iteran `AST_RULES` genéricamente.
- `lib/validate-config.mjs`: agregar los 4 ids a `KNOWN_RULES` y `minMembers` ya está en `NUMERIC_KEYS`
  (agregar `minProps` ya está; `pattern` es string — no requiere validación numérica, opcional un check de string).
- `config/defaults.json`:
  ```json
  "prefer-satisfies": { "enabled": true, "minProps": 1 },
  "as-const-opportunity": { "enabled": true },
  "prefer-discriminated-union": { "enabled": false, "minMembers": 2 },
  "prefer-branded-type": { "enabled": false, "pattern": "(Id|Token|Key|Uuid|Hash)$" }
  ```

## C. Tests

Una regla por archivo de test, con fixtures `.ts` mínimos bajo `test/fixtures/ast/<regla>/`, armando
un `astContext` real con `buildContextFor` (helper de Fase 2). Por regla: un caso **positivo** (dispara)
y uno **negativo** (no dispara) — clave en las experimentales para acotar FP. Más:
- `prefer-satisfies`: positivo `const x: Named = {…}`; negativo `const x = {…} satisfies Named` (ya correcto) y `const x: string = 'a'` (no object-literal).
- `as-const-opportunity`: positivo `const R = ['a','b']; type T = typeof R[number]`; negativo el mismo con `as const`.
- `prefer-discriminated-union`: positivo union sin discriminante; negativo union con campo `kind` literal distinto.
- `prefer-branded-type`: positivo `type UserId = string`; negativo `type UserName = string` (nombre no-identidad) y `type UserId = { … }` (no primitivo).
- Test de registro/defaults extendido para los 4 ids.
- Mantener verde el suite completo.

## D. Docs
- `AGENTS.md` (=CLAUDE.md): sumar las 4 al listado de reglas TS con AST, notando las 2 experimentales (default off).
- `README.md`: ídem en la sección de reglas TypeScript.
- `praxis-config` skill: ofrecer las 4 (y el `pattern`/`minMembers`).

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `rules/prefer-satisfies.mjs` | crear |
| `rules/as-const-opportunity.mjs` | crear |
| `rules/prefer-discriminated-union.mjs` | crear |
| `rules/prefer-branded-type.mjs` | crear |
| `rules/index.mjs` | modificar (AST_RULES += 4) |
| `lib/validate-config.mjs` | modificar (KNOWN_RULES += 4) |
| `config/defaults.json` | modificar (defaults de las 4) |
| `test/fixtures/ast/<regla>/` ×4 | crear |
| `test/rules/*.test.mjs` ×4 | crear |
| `AGENTS.md`, `README.md`, skill praxis-config | modificar (docs) |
