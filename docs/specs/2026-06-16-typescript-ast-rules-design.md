# Reglas TypeScript con AST (reuso real de tipos) — Fase 2

> Diseño aprobado — 2026-06-16. Continúa el grupo `typescript`. Introduce una **tercera clase
> de regla** (`ast`) que usa el type-checker de TS para detectar reuso de tipos cruzando
> archivos. Corre **solo en la auditoría profunda** (opt-in), nunca en el hook por-archivo.
> Continuación natural de la Fase 1 (`2026-06-15-typescript-tailwind-rules-design.md`), que ya
> dejó esta fase anotada como no-objetivo.

## Objetivo

Las reglas de Fase 1 son heurísticas (regex, zero-dep) y no pueden comparar tipos de verdad.
Esta fase agrega reglas que **empujan al reuso real de tipos**, lo cual requiere el modelo de
tipos del proyecto (el "programa" de TypeScript):

1. **`type-duplicate-shape`** — dos `interface`/`type` en archivos distintos donde uno es
   superset del otro → sugerir derivar con `Pick<Base, ...>` / `Omit<Base, ...>` en vez de
   redeclarar.
2. **`inline-shape-extract`** — un object-type inline (param/retorno/variable) cuya forma
   coincide con un `type`/`interface` con nombre ya existente → sugerir referenciarlo.
3. **`schema-type-redeclare`** — un `type`/`interface` escrito a mano cuya forma coincide con
   `z.infer<typeof Schema>` de un schema Zod/Valibot existente → sugerir derivar con `z.infer`.

Además, una cuarta regla **sin AST** que entró en la misma divergencia:

4. **`magic-literal-repeated`** — un literal (número o string) repetido en N archivos → sugerir
   extraer a una const compartida. **No necesita type-checker** (regex alcanza): se modela como
   una *project rule* normal, no como AST rule. Comparte el pipeline de findings pero no toca la
   infra TS.

## No-objetivos (YAGNI / honestidad técnica)

- **Aplicar los fixes automáticamente** (reescribir el código a `Pick<...>`): las reglas solo
  *sugieren* (`info`). Un fixer AST es otra fase.
- **Correr AST en el hook por-archivo o en el pre-commit**: el análisis es lento (segundos en
  repos grandes). Solo corre en la auditoría profunda, opt-in.
- **Bundlear `typescript` en el plugin**: se usa el `typescript` del proyecto auditado (peer).
- **Inferencia desde otros validadores** (Valibot/io-ts más allá de Zod): `schema-type-redeclare`
  cubre Zod (y por extensión `z.infer`); otros schemas quedan para después.

---

## A. Tercera clase de regla: `ast`

Hoy hay dos clases:

- **file rules** (`RULES`) — `(content, filePath, ruleConfig, fullConfig) => Finding[]`. Corren
  en el hook y en la auditoría, por archivo.
- **project rules** (`PROJECT_RULES`) — `(tree, fullConfig) => Finding[]`. Corren una vez por
  proyecto en la auditoría, con visibilidad del árbol de archivos.

Se agrega una tercera:

- **ast rules** (`AST_RULES`) — `(astContext, fullConfig) => Finding[]`. Corren una vez por
  proyecto, **solo en la auditoría profunda**, con acceso al type-checker de TS.

```js
// rules/index.mjs
export const AST_RULES = {
  'type-duplicate-shape':  typeDuplicateShape,
  'inline-shape-extract':  inlineShapeExtract,
  'schema-type-redeclare': schemaTypeRedeclare,
};
```

### A.1 `astContext`

```js
astContext = {
  ts,            // el módulo typescript del proyecto auditado
  program,       // ts.Program ya construido
  checker,       // program.getTypeChecker()
  sourceFiles,   // ts.SourceFile[] in-scope (sin node_modules ni excluidos)
  projectDir,    // raíz del proyecto auditado
}
```

El programa se construye **una sola vez** (módulo B) y se pasa a las tres reglas. Cada regla
recorre los `sourceFiles` y le pregunta al `checker` lo suyo; la travesía por regla es barata,
lo caro (construir el programa) se paga una vez.

### A.2 Finding

Mismo shape de siempre: `{ rule, file, line, severity, message }`. La línea sale del nodo TS:

```js
const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
// finding.line = line + 1 (TS es 0-indexed)
// finding.file = path relativo de sourceFile.fileName respecto de projectDir
```

Cero cambios en `lib/findings.mjs`, baseline, ni output: encajan en el pipeline existente.

---

## B. Construcción del programa TS — `lib/ts-program.mjs`

```js
export async function buildTsContext(projectDir, config) {
  // 1. resolver el typescript del PROYECTO (peer), no del plugin
  let ts;
  try {
    const tsPath = require.resolve('typescript', { paths: [projectDir] });
    ts = (await import(pathToFileURL(tsPath))).default ?? (await import(pathToFileURL(tsPath)));
  } catch {
    return null;   // TS no instalado en el proyecto → reglas AST off
  }

  // 2. leer y parsear tsconfig.json del proyecto
  const configPath = ts.findConfigFile(projectDir, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) return null;
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, ts.sys);
  if (!parsed) return null;

  // 3. construir el programa + checker
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();

  // 4. filtrar a los archivos in-scope (respeta include/exclude del plugin)
  const sourceFiles = program.getSourceFiles().filter(
    (sf) => !sf.isDeclarationFile && isInScope(relativeTo(projectDir, sf.fileName), config),
  );

  return { ts, program, checker, sourceFiles, projectDir };
}
```

- Resuelve `typescript` **desde `projectDir`** (peer/optional) → análisis fiel con la versión
  que usa el equipo. Si falta → `null` → degradación elegante (mismo patrón que autodetect).
- Filtra a los archivos in-scope del plugin (reusa `lib/scope.mjs`), descartando
  `.d.ts` y todo lo excluido por config.
- Robusto: cualquier fallo (tsconfig roto, error de TS) → `null`, nunca rompe la auditoría.

---

## C. Integración en el runner — `bin/praxis-audit.mjs`

Las AST rules corren **solo si** se pidió análisis profundo:

```js
const wantAst = flags.ast || (mode === 'full' && anyAstRuleRunsOnFull(config));
if (wantAst) {
  const astCtx = await buildTsContext(dir, config);
  if (!astCtx) {
    warn('reglas AST omitidas: typescript no está instalado en el proyecto');
  } else {
    findings.push(...runAstRules(astCtx, config, custom.astRules));
  }
}
```

- **`flags.ast`** ← el flag `--deep` (alias `--ast`). Es plomería de bajo nivel: lo usa CI,
  el pre-commit configurado, o la skill `praxis-config`/`praxis-audit` por debajo. **Ningún
  humano lo tipea** (ver sección E).
- **`runOn: 'full'`** ← una regla AST con `config.rules.<id>.runOn === 'full'` corre también
  en toda auditoría `full` (sin pasar el flag). Pensado para que un equipo lo active en CI.
- `runAstRules` itera `{ ...custom.astRules, ...AST_RULES }`, saltea las `enabled: false`,
  y envuelve cada regla en try/catch (una regla rota nunca rompe la auditoría) — igual que
  `runProjectRules`.

Las AST rules **nunca** corren en el hook, en `--staged`, ni en incremental sin flag. El flujo
diario (hook, pre-commit) queda rápido.

`magic-literal-repeated` (sin AST) entra en `PROJECT_RULES` y corre con las project rules
normales — no depende de `--deep`.

---

## D. Custom AST rules — `lib/custom-rules.mjs`

El loader aprende un tercer `kind`:

```js
const kind = (mod.meta && mod.meta.kind);
if (kind === 'ast') out.astRules[id] = mod.default;
else if (kind === 'project') out.projectRules[id] = mod.default;
else out.fileRules[id] = mod.default;
```

Un proyecto puede escribir `.praxis-guard/rules/<id>.mjs` con
`export const meta = { kind: 'ast' }` y su `default` recibe `(astContext, fullConfig)`. Mismo
contrato que las built-in. (Las custom AST rules solo corren si la auditoría es profunda, igual
que las built-in.)

---

## E. UX: menú en la skill, flag interno

La objeción de diseño: **el usuario no debe aprender flags.** Hay dos interfaces y solo una es
para humanos:

- **Motor CLI** (`node bin/praxis-audit.mjs --deep`) — plomería. La usan CI, scripts y el
  pre-commit. Las máquinas no usan menús.
- **Skill `praxis-audit`** — la UX humana/agente. Ya "decide sola" full vs incremental.

La skill ofrece un menú al auditar:

```
Auditoría de proyecto. ¿Qué tan profundo?
  1. Rápida    — reglas de contenido / arquitectura / TS heurísticas (segundos)
  2. Profunda  — + análisis de tipos cruzando archivos (Pick/Omit, derivación) · más lenta
```

Elegir **2** → la skill corre `praxis-audit --deep`. Cero flags memorizados, opción
**descubrible** en cada auditoría. Si la skill detecta `tsconfig.json` y nunca se corrió el
análisis profundo, puede destacar la opción 2 la primera vez.

**Naming del flag interno:** `--deep` (con `--ast` como alias). `--deep` describe el *valor*
(análisis profundo) y no ata el plugin a que todo análisis lento sea AST; envejece mejor.

---

## F. Las tres reglas AST (detección)

Todas emiten `severity: 'info'` (sugerencias, no errores) — coherente con `stringly-typed` /
`repeated-object-shape` de Fase 1.

### F.1 `type-duplicate-shape`
Para cada par de declaraciones de tipo con nombre (`interface`/`type` con object-type) en
**archivos distintos**: si el set de propiedades de A es un **superset** del de B (mismas
keys, tipos asignables vía `checker.isTypeAssignableTo`), y el solapamiento es ≥ `minProps`,
emitir sobre A:

> `"A" repite las props de "B" (src/b.ts). Considerá derivar: type A = Pick<B, '...'> & { ... }` (o `Omit`).

Config: `minProps` (default 2). Evita el ruido de tipos que comparten 1 sola prop trivial
(`id`).

### F.2 `inline-shape-extract`
Para cada object-type **inline** (en parámetro, retorno o anotación de variable) cuya forma
es **estructuralmente igual** a un `type`/`interface` con nombre declarado en el proyecto:

> `Esta forma inline coincide con el type "User" (src/user.ts). Considerá referenciarlo por nombre.`

Gating: ignora object-types triviales (< `minProps`, default 2) para no marcar `{ x: number }`.

### F.3 `schema-type-redeclare`
Solo si el proyecto importa `zod` (detección por import; si no hay Zod → no-op). Para cada
schema `const X = z.object({...})` y cada `type`/`interface` con nombre cuya forma coincide con
`z.infer<typeof X>` (comparado vía checker):

> `El type "T" duplica la forma de "z.infer<typeof X>" (src/schema.ts). Considerá: type T = z.infer<typeof X>.`

---

## G. Config (`config/defaults.json`)

Las tres reglas AST + la project rule arrancan **`enabled: true`** (coherente con el resto del
plugin). El flag `--deep` / `runOn` ya es la barrera de "esto es intencional y lento"; una
segunda barrera (`enabled: false`) las haría invisibles.

```json
{
  "rules": {
    "type-duplicate-shape":  { "enabled": true, "minProps": 2 },
    "inline-shape-extract":  { "enabled": true, "minProps": 2 },
    "schema-type-redeclare": { "enabled": true },
    "magic-literal-repeated":{ "enabled": true, "minFiles": 3, "minLen": 4 }
  }
}
```

`runOn` es opcional por regla (`'deep'` default implícito | `'full'`). Documentado en
`praxis-config`.

---

## H. Tests

- **`typescript` como `devDependency` del plugin** — solo para correr los tests acá. El runtime
  sigue siendo peer (TS del proyecto auditado). Sin esto las reglas AST no tendrían tests reales.
- Cada regla AST: fixtures `.ts` mínimos en `test/fixtures/ast/<regla>/`, se construye un
  `astContext` real con el TS del propio repo, y se assertan cantidad / línea / mensaje del
  finding — mismo patrón directo de los tests actuales.
- Test de degradación: `buildTsContext` con un dir sin `typescript` → `null`; el runner no rompe
  y reporta el aviso.
- `magic-literal-repeated`: test de project rule normal (sin TS).
- Mantener verde el suite completo (hoy 51/51).

---

## I. Documentación

- `CLAUDE.md`: agregar el grupo de reglas AST y el modo profundo (skill menú / `--deep`).
- `praxis-config`: ofrecer las nuevas reglas y el parámetro `runOn`.
- Skill `praxis-audit`: agregar el menú rápida/profunda.

---

## Resumen de decisiones

| Decisión | Elección |
|---|---|
| Reglas AST v1 | `type-duplicate-shape`, `inline-shape-extract`, `schema-type-redeclare` |
| Regla sin AST | `magic-literal-repeated` (project rule, regex) |
| Dependencia TS runtime | **peer/optional** (TS del proyecto auditado) |
| Dependencia TS tests | **devDependency** del plugin |
| Acceso al programa | una clase `ast` con `astContext` compartido (programa construido 1 vez) |
| Cuándo corren | opt-in: `--deep` **o** `runOn: 'full'` en auditoría full |
| UX | menú rápida/profunda en la skill; flag `--deep` interno |
| Naming flag | `--deep` (alias `--ast`) |
| `enabled` default | `true` (las tres + la project rule) |
| Severidad | `info` |
