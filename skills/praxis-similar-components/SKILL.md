---
name: praxis-similar-components
description: Detecta componentes React parecidos/duplicados entre archivos que convendría unificar en un componente compartido. Invocar cuando el usuario dice "buscá componentes para unificar", "qué componentes se repiten", "componentes duplicados/parecidos", o quiere DRY-ear componentes.
---

# praxis-similar-components

Encuentra grupos de componentes con estructura JSX parecida (candidatos a unificar). Motor:
`bin/similar-components.mjs` (determinista). **Solo sugiere** — no refactoriza.

## Proceso
1. Correr `node ${CLAUDE_PLUGIN_ROOT}/bin/similar-components.mjs --dir <raíz>` → leer `{ groups }`.
   (Params opcionales: `--threshold 0.85`, `--min-elements 3`.)
2. Si `groups` está vacío → avisar que no hay componentes parecidos sobre el umbral (y que se puede
   bajar `--threshold`).
3. Presentar los grupos **rankeados** (vienen ordenados por el motor): primero los `priority: "high"`
   (`sameFeature: true` — mismo feature, casi siempre duplicación real y de bajo riesgo unificar),
   después los `priority: "low"` (cross-feature: revisar, suelen chocar con theming distinto). Tratá
   los high como **probables duplicados accionables** y los low como **parecidos a revisar**. Usá la
   `similarity` continua para ordenar dentro de cada bloque; un grupo de baja similitud o cross-feature
   con props muy distintas suele ser falso positivo (misma forma de JSX, datos distintos).
4. Por cada grupo: listar `file:name` + `similarity` + `feature`; **sugerir** unificarlos en un componente
   compartido — proponer ubicación (`src/shared/` o `components/` según la estructura del repo) y qué
   difiere entre ellos (lo que sería props del compartido). Es una **sugerencia**: el dev decide.
5. **Idiom consistente entre hermanos:** si dos+ componentes de la misma feature resuelven el MISMO
   sub-problema estructural escrito de formas distintas (uno con `const steps = [...]` + `{steps[i]}`,
   el otro inline `{[<A/>,<B/>][i]}`; uno con `.map`, otro con `for`), sugerí unificar a la forma más
   legible/nombrada (extraer a const con nombre, no array literal inline indexado). Un patrón, una forma.
6. NO edites archivos salvo pedido explícito; un refactor real es otro trabajo.

## Reglas
- El reporte es best-effort (estructura JSX + hooks, no semántica). Filtrá los falsos positivos con criterio.
- Subí `--threshold` si hay ruido; bajalo si querés casos más laxos.
- La `similarity` de un grupo es el **piso conservador** (la mínima similitud pairwise del grupo). Como el
  agrupado es transitivo (A~B y B~C unen a A, B y C aunque A~C sea más bajo), ese piso **puede quedar por
  debajo del `--threshold`** que pediste. Es esperado: usalo como señal, no como garantía dura.
- Solo detecta componentes declarados como `function` o `const X = () => …`. Los envueltos en
  `React.memo(...)` / `forwardRef(...)` **no** se ven (limitación conocida del v1).
