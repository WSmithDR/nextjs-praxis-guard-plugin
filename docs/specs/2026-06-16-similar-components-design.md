# Auditor de componentes similares (`praxis-similar-components`) — Diseño

> Diseño aprobado — 2026-06-16. On-demand: un motor determinista (`bin/similar-components.mjs`) detecta
> **componentes React parecidos/duplicados** entre archivos (por firma estructural del JSX + hooks) y
> los agrupa; una skill `praxis-similar-components` presenta los grupos y sugiere unificarlos en un
> componente compartido. Es el equivalente "a nivel componente" de `type-duplicate-shape`.

## Objetivo

Detectar componentes que convendría unificar en uno compartido (DRY). Análisis intencional (no en cada
auditoría): el dev lo corre cuando quiere refactorizar. Señala candidatos; **no** refactoriza.

## Decisiones (de la divergencia)

| Decisión | Elección |
|---|---|
| Métrica de "similar" | firma estructural del JSX (multiset de tipos de elemento) + hooks, **Jaccard ponderado**, umbral configurable |
| Entrega | **on-demand**: motor `bin/` + skill `praxis-similar-components` (como gen-tests), fuera de `--deep` |
| Umbral / params | `threshold` (default 0.85), `minElements` (default 3, ignora wrappers triviales) |
| Salida | reporte JSON a stdout (grupos de componentes + similitud) |
| Acción | la skill **sugiere** extraer a un compartido; no refactoriza |

## No-objetivos (YAGNI)

- **Refactor automático.** Solo señala los grupos.
- **Similitud semántica** más allá de estructura JSX + hooks (no análisis de lógica/data-flow).
- Comparar contra `node_modules` / dependencias.
- Shingling de tokens (descartado: más ruidoso/caro para este caso).

---

## A. Fingerprint — `lib/component-fingerprint.mjs`

- `extractComponents(ts, sourceFile)` → `[{ name, fnNode }]`: declaraciones top-level (function decl o
  `const X = () => …`) cuyo **cuerpo contiene JSX** (= componente). Nombre del símbolo.
- `fingerprintComponent(ts, fnNode)` → `{ elements: Map<tag, count>, hooks: Set<string>, size }`:
  - recorre el cuerpo: cada `JsxOpeningElement`/`JsxSelfClosingElement` → `tagName.getText()` cuenta en
    `elements`; `size` = total de elementos JSX;
  - `CallExpression` con callee `Identifier` que matchee `/^use[A-Z]/` → agrega a `hooks`.
- `similarity(a, b)` → `0..1`:
  - `elemSim` = Jaccard ponderado del multiset: `Σ min(a,b) / Σ max(a,b)` sobre la unión de tags;
  - `hookSim` = Jaccard de sets (`|∩|/|∪|`; si ambos vacíos → 1);
  - `sim = 0.8 * elemSim + 0.2 * hookSim`.

## B. Agrupado — `lib/similar-components.mjs`

`findSimilarGroups(ts, files, { threshold = 0.85, minElements = 3 } = {})`:
- `files` = rutas absolutas de `.tsx`/`.jsx`. Por cada una: leer (try/catch), `ts.createSourceFile`,
  `extractComponents`, `fingerprintComponent`; descartar los de `size < minElements`. Acumular en una
  lista plana `[{ file, name, fp }]`.
- Pares `i<j`: si `comps[i].file !== comps[j].file` **y** `similarity(fp_i, fp_j) ≥ threshold` → unir
  (union-find) y guardar la similitud del par.
- **Componentes conexos** → grupos; devolver los de tamaño ≥2, cada uno con `similarity` (la mínima
  pairwise del grupo, conservadora) y `components: [{ file, name }]`. Ordenar por `similarity` desc.
- Determinista y robusto: un archivo que no parsea se saltea; nunca lanza.

## C. CLI — `bin/similar-components.mjs`

`node bin/similar-components.mjs [--dir <proyecto>] [--threshold 0.85] [--min-elements 3]`:
- Resuelve `typescript` peer (como `gen-tests`/`buildTsContext`); si falta → reporte vacío + aviso a stderr.
- Enumera archivos in-scope con `enumerateFiles(dir, config)` (`lib/walk.mjs` + `loadConfig`), filtra a
  `.tsx`/`.jsx`.
- `findSimilarGroups(ts, files, { threshold, minElements })` → imprime `{ groups: [...] }` (JSON) a stdout.

## D. Skill — `praxis-similar-components`

`skills/praxis-similar-components/SKILL.md`. `Use when…`: "buscá componentes para unificar",
"¿qué componentes se repiten?", "componentes duplicados/parecidos". Proceso:
1. Correr `node ${CLAUDE_PLUGIN_ROOT}/bin/similar-components.mjs --dir <proyecto>` → leer los grupos.
2. Si no hay grupos → avisar "no se detectaron componentes parecidos sobre el umbral".
3. Por cada grupo: listar los componentes (file:name) + la similitud; **sugerir** unificarlos en un
   componente compartido (proponer ubicación `src/shared/` o `components/` según la estructura del repo,
   y qué difiere entre ellos como props del compartido). Recordar que es una **sugerencia**; el dev decide.
4. No editar archivos salvo que el usuario lo pida explícitamente (y ahí, un refactor es otro trabajo).

## E. Tests (del plugin)

`lib/similar-components.mjs` + `lib/component-fingerprint.mjs` (parte determinista):
- `test/lib/similar-components.test.mjs`: en tmp, `CardA.tsx` y `CardB.tsx` con JSX casi idéntico
  (`div>h2>p>button`, mismo set de elementos) y `Other.tsx` con estructura distinta (`span`) →
  `findSimilarGroups(ts, [3 rutas], { threshold: 0.8, minElements: 2 })` devuelve **1 grupo** con
  `CardA`+`CardB`, similitud alta; `Other` no aparece. Dos archivos idénticos → similitud ~1.0.
  Componentes con `size < minElements` se ignoran.
- `test/lib/component-fingerprint.test.mjs`: `fingerprintComponent` cuenta elementos/hooks correctos;
  `similarity` da 1.0 para fps iguales y <1 para distintos.
- La presentación (skill) no se testea unitariamente.
- Suite verde.

## F. Docs
- `AGENTS.md` / `README.md`: documentar la skill `praxis-similar-components` y el motor.

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `lib/component-fingerprint.mjs` | crear (extraer componentes + fingerprint + similarity) |
| `lib/similar-components.mjs` | crear (agrupar) |
| `bin/similar-components.mjs` | crear (CLI: enumera + corre + JSON) |
| `skills/praxis-similar-components/SKILL.md` | crear |
| `test/lib/component-fingerprint.test.mjs`, `test/lib/similar-components.test.mjs` | crear |
| `AGENTS.md`, `README.md` | docs |
