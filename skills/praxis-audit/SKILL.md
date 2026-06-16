---
name: praxis-audit
description: Audita un proyecto Next.js completo con las reglas de praxis-guard. Decide solo entre auditoría completa (cambió la versión del plugin o el código/config de las reglas) y auditoría incremental (solo el diff de git desde la última corrida). Invocar cuando el usuario dice "auditá el proyecto", "corré praxis-audit", "revisá todo el repo", o quiere chequear malas praxis fuera del flujo archivo-por-archivo del hook.
---

# praxis-audit

Motor determinista: `bin/praxis-audit.mjs`. Esta skill solo lo invoca y presenta el reporte.

## Cómo correrlo

- Auto (recomendado): `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --dir <proyecto>`
  - Completa si cambió `plugin_version` o `rules_fingerprint`, o si no hay `last_audited_commit`.
  - Incremental (git diff desde `last_audited_commit`) en caso contrario.
- Forzar completa: `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --full --dir <proyecto>`
- Desde un ref: `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --since <ref> --dir <proyecto>`
- Pre-commit (lo usa el hook git): `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --staged --dir <proyecto>`
- Arreglar tsconfig (opt-in): `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --fix-tsconfig --dir <proyecto>`
  - Aplica el `baseline` de `tsconfig-strictness` a `compilerOptions`. Solo escribe si el
    `tsconfig.json` es JSON limpio sin `extends`; si no, lista los flags para agregar a mano.
- Aceptar la deuda actual (baseline): `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --update-baseline --dir <proyecto>`
  - Snapshotea TODOS los findings actuales en `.praxis-guard/baseline.json` (committealo). Desde
    ahí, las corridas normales ocultan esos y muestran solo lo **nuevo**.
- Ver todo (ignorar baseline): agregá `--no-baseline`.
- CI / SARIF: `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --full --deep --format sarif --gate --dir <proyecto>`
  - `--format sarif`: a stdout va **solo** el JSON SARIF 2.1.0 (diagnósticos a stderr) → `> praxis.sarif`.
  - `--gate`: exit 1 si hay findings (mostrados, post-baseline) ≥ `commit.minSeverity`. Es plomería de
    CI (lo usa el workflow `github-action`), no UX humana cotidiana.
- **Profunda** (análisis de tipos cruzando archivos): agregá `--deep` (alias `--ast`).
  - Corre además las reglas AST de reuso de tipos (`type-duplicate-shape`,
    `inline-shape-extract`, `schema-type-redeclare`). Arma el programa TS del proyecto
    una sola vez → es **lento** (segundos en repos grandes). Requiere `typescript`
    instalado en el proyecto; si falta, se omiten con un aviso.

## Profundidad (preguntale al usuario)

Antes de auditar, ofrecé elegir qué tan profundo:

1. **Rápida** — reglas de contenido / arquitectura / TS heurísticas (segundos).
   `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --dir <proyecto>`
2. **Profunda** — además análisis de tipos cruzando archivos (Pick/Omit, derivación). Más lenta.
   `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-audit.mjs --deep --dir <proyecto>`

`--deep` es plomería interna: el usuario elige del menú, vos traducís a la bandera. Si el
proyecto tiene `tsconfig.json` y nunca se corrió la profunda, destacá la opción 2.

## Proceso

1. Correr el comando (auto, o `--deep` si el usuario eligió profunda) sobre la raíz del proyecto.
2. Leer el reporte (findings agrupados por archivo + el modo usado).
3. Presentarle al usuario los findings priorizados; si hay muchos, agrupar por regla.
4. Si aparece un finding de arquitectura y el proyecto aún no declaró estrategia
   (`architecture.strategy`), sugerir la skill `praxis-config`.
5. Si el audit avisa que hay findings de la baseline ya resueltos, sugerí `--update-baseline`
   para limpiarlos (evita que una regresión futura quede oculta por una huella huérfana).

## Estado

El motor estampa en `.praxis-guard/meta.json`: `last_audited_commit`, `rules_fingerprint`,
`plugin_version`. No tocar a mano. El modo `--staged` NO avanza ese estado (el commit aún no ocurrió).

## Reglas
- El motor nunca rompe la edición ni la sesión: exit 0 salvo el caso `--staged` con
  `commit.block: true` y findings ≥ `commit.minSeverity` (aborta el commit).
- Las reglas de arquitectura solo corren si el proyecto declaró `architecture.strategy`.
- Las reglas custom de `.praxis-guard/rules/*.mjs` corren en la auditoría (file + project). Si una
  no carga (syntax error / colisión con built-in), se reporta `⚠ regla custom "x" no cargó` sin abortar.
