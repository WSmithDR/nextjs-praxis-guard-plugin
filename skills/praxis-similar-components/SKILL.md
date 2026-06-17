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
3. Por cada grupo: listar `file:name` + la `similarity`; **sugerir** unificarlos en un componente
   compartido — proponer ubicación (`src/shared/` o `components/` según la estructura del repo) y qué
   difiere entre ellos (lo que sería props del compartido). Es una **sugerencia**: el dev decide.
4. NO edites archivos salvo pedido explícito; un refactor real es otro trabajo.

## Reglas
- El reporte es best-effort (estructura JSX + hooks, no semántica). Filtrá los falsos positivos con criterio.
- Subí `--threshold` si hay ruido; bajalo si querés casos más laxos.
