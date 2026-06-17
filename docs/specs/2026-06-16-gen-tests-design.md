# Generación automática de tests (`praxis-gen-tests`) — Diseño

> Diseño aprobado — 2026-06-16. Nueva capacidad: dado un archivo/componente, generar su archivo de
> test. **Híbrido**: un motor determinista (`bin/gen-tests.mjs`) analiza (framework, ruta, firma del
> componente vía parser TS) y emite un PLAN; la skill `praxis-gen-tests` guía al agente a escribir los
> casos reales sobre ese plan. Agnóstica (skill, como praxis-audit/config).

## Objetivo

Reducir la fricción de empezar un test: el motor resuelve lo mecánico y consistente (qué framework,
dónde va el archivo, cómo se llama, qué exporta/qué props tiene el componente), y el agente escribe
casos de verdad guiado por eso. Scaffold útil con casos reales, no cobertura exhaustiva.

## Decisiones (de la divergencia)

| Decisión | Elección |
|---|---|
| Generación | **híbrido**: motor determinista (plan) + agente (casos), no LLM-solo ni scaffold-tonto |
| Invocación | **skill agnóstica** `praxis-gen-tests` (sin slash command CC-específico) |
| Motor | `bin/gen-tests.mjs` (+ lib testeable); `typescript` peer para el parser |
| Salida | PLAN en **JSON a stdout** (mismo patrón que `--format sarif`) |
| Alcance de casos | liviano: render/smoke + un test por prop significativa + ramas obvias |
| Seguridad | **nunca pisa** un test existente; crear archivo = acción saliente → la skill confirma |

## No-objetivos (YAGNI)

- Cobertura exhaustiva / edge cases complejos; mocking automático de dependencias.
- Frameworks fuera de `vitest` / `jest` / `node:test`.
- Slash command (la skill es agnóstica; un wrapper CC queda como posible futuro).

---

## A. Motor — `lib/gen-tests-plan.mjs` + `bin/gen-tests.mjs`

`bin/gen-tests.mjs <archivo> [--dir <proyecto>]`:
- Resuelve `typescript` peer desde el proyecto (como `buildTsContext`); si falta → el plan omite la
  firma (igual emite framework/ruta).
- Llama `buildTestPlan(ts, projectDir, targetAbsPath)` y escribe el JSON a **stdout** (diagnósticos a stderr).

`lib/gen-tests-plan.mjs` — `buildTestPlan(ts, projectDir, targetFile)` → objeto:
```jsonc
{
  "targetFile": "src/Button.tsx",
  "framework": "vitest",            // vitest | jest | node:test
  "testImport": "import { describe, it, expect } from 'vitest';",
  "usesRTL": true,                   // @testing-library/react presente
  "testFilePath": "src/Button.test.tsx",
  "exists": false,                   // ya hay un test ahí
  "component": {                     // null si no se pudo parsear / no es componente
    "name": "Button",
    "exportKind": "default",         // default | named
    "isReactComponent": true,
    "props": [{ "name": "label", "type": "string" }, { "name": "onClick", "type": "() => void" }]
  },
  "hints": ["render con @testing-library/react", "probar onClick", "..."]
}
```

### A.1 Framework — `detectTestFramework(projectDir)`
Lee `package.json` (deps+devDeps): `vitest` → vitest; `jest` → jest; si no → `node:test`. `usesRTL` =
`@testing-library/react` presente. `testImport` arma el import del framework (vitest/jest globals o
`node:test`+`assert`). Best-effort por configs (`vitest.config.*`/`jest.config.*`) si no está en deps.

### A.2 Ruta — `resolveTestPath(projectDir, targetFile)`
Convención best-effort: si existe un `__tests__/` hermano o tests en `__tests__/`, usar
`__tests__/<name>.test.<ext>`; si no, **co-located** `<dir>/<name>.test.<ext>`. `exists` = el archivo
ya existe. (Scan acotado; default co-located.)

### A.3 Firma — `extractComponentSignature(ts, targetFile)`
`ts.createSourceFile` (parser, no ejecuta) sobre el target:
- Encuentra el export default y/o named con nombre capitalizado (componente) o función util.
- `isReactComponent`: archivo `.tsx`/`.jsx` y el export es función/arrow (heurístico).
- `props`: del primer parámetro tipado (`(props: PropsType)` → resuelve la interface/type en el archivo;
  `({a, b}: {a:..., b:...})` → del type literal). Best-effort; si no se puede, `props: []`.
- Si no hay export parseable → `component: null`.

## B. Skill — `praxis-gen-tests`

`skills/praxis-gen-tests/SKILL.md`. Frontmatter `Use when…`: "generá tests para <archivo>", "creá el
test de este componente", "scaffold de test". Proceso:
1. Correr `node ${CLAUDE_PLUGIN_ROOT}/bin/gen-tests.mjs <archivo> --dir <proyecto>` → leer el PLAN.
2. Si `exists: true` → **no pisar**: avisar y preguntar (otro nombre / append / cancelar).
3. Escribir el archivo en `testFilePath` con el `testImport` del plan y **casos reales**:
   - import del componente (según `exportKind`);
   - test de **render/smoke** (con `render` si `usesRTL`, si no instanciar/llamar);
   - un test por **prop significativa** del plan (`onClick` → simular click y assert; valores → assert en el render);
   - ramas obvias evidentes del componente.
   Alcance liviano; dejar claro al usuario que es un punto de partida.
4. Confirmar con el usuario antes de crear el archivo (acción saliente).

## C. Tests (del plugin)

`lib/gen-tests-plan.mjs` es la parte determinista y testeable:
- `test/lib/gen-tests-plan.test.mjs`: fixtures en tmp —
  - proyecto con `vitest` en devDeps + un `Button.tsx` (`export default function Button(props: { label: string; onClick: () => void })`)
    → plan: `framework:'vitest'`, `testFilePath` co-located `Button.test.tsx`, `component.name:'Button'`,
    `exportKind:'default'`, `isReactComponent:true`, props incluye `label` y `onClick`.
  - proyecto con `jest` → `framework:'jest'`.
  - sin vitest/jest → `framework:'node:test'`.
  - un util `.ts` (`export function add(a:number,b:number)`) → `isReactComponent:false`, props del param.
  - si el test ya existe → `exists:true`.
- La generación de casos (agente) NO se testea unitariamente.
- Suite verde.

## D. Docs
- `AGENTS.md` / `README.md`: documentar la skill `praxis-gen-tests` y el motor `bin/gen-tests.mjs`.
- `bin/gen-tests.mjs` aparece en la lista de soporte/uso.

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `lib/gen-tests-plan.mjs` | crear (motor: framework + ruta + firma → plan) |
| `bin/gen-tests.mjs` | crear (resuelve ts peer, IO, stdout JSON) |
| `skills/praxis-gen-tests/SKILL.md` | crear (guía al agente) |
| `test/lib/gen-tests-plan.test.mjs` + fixtures | crear |
| `AGENTS.md`, `README.md` | docs |
