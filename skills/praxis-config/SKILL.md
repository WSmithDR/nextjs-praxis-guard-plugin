---
name: praxis-config
description: Configura nextjs-praxis-guard para ESTE proyecto de forma interactiva — qué reglas corren y con qué parámetros. Use when el usuario dice "configurá praxis", "qué reglas aplico", "cambiar la config del guard", o cuando falta `.praxis-guard/config.json`.
---

# praxis-config

Arma o edita la config por-proyecto del plugin nextjs-praxis-guard. La config vive en
`.praxis-guard/config.json` (committeala: es config de equipo). Esta skill conduce el Q&A;
la escritura la hace el CLI determinista `bin/praxis-config.mjs` (valida + escribe atómico).

## Proceso

1. **Leé el estado actual** corriendo:
   `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-config.mjs show --dir <raíz-del-proyecto>`
   - Salida `{}` → modo **first-run** (no hay config).
   - Salida con contenido → modo **editar** (mostrásela al usuario antes de preguntar).

2. **Preguntá al usuario** (en Claude Code podés usar la UI de opciones; en otros CLIs,
   en el chat). Cubrí, una cosa a la vez:
   - **Reglas de contenido** activar/desactivar: `secrets`, `hardcoded-data`,
     `forbidden-imports`, `file-responsibility`, `untranslated-text`.
   - Umbrales: `file-responsibility.maxLines` (default 400) y `mixedSignalsLines` (200);
     `hardcoded-data.minElements` (8).
   - `forbidden-imports.list`: entradas `{ "module": "...", "message": "..." }`.
   - `untranslated-text`: on/off y `ignore` (textos permitidos).
   - **Reglas de arquitectura** (opt-in, todas `enabled: false` por default): `folder-placement`,
     `layer-boundaries`, `server-client-boundaries`, `feature-deps` (por-archivo) y
     `architecture-coherence` (solo auditoría). **No corren** hasta declarar el bloque
     `architecture.strategy` (`by-feature` | `by-layer`). Si el usuario quiere activarlas,
     preguntá la estrategia y, según la regla: `folder-placement.placement[]`
     (`{kind, match, allowed}`), `layer-boundaries.layers[]` (`{name, path, mayImport}`),
     `server-client-boundaries.serverOnly[]`, `feature-deps.publicEntry[]`.
   - **Reglas TypeScript** (autodetect si hay `tsconfig.json`; apuntan al aprovechamiento de
     tipos, NO duplican ESLint): `repeated-object-shape` (`minProps`/`minRepeats`),
     `stringly-typed` (`minLiterals`), `duplicate-literal-union` (`minMembers`/`minRepeats`),
     `prefer-as-const`, y `tsconfig-strictness` (`baseline`: flags a exigir, ej.
     `["strict","noImplicitAny"]`).
   - **Reglas TypeScript con AST** (Fase 2, solo en el **modo profundo** `praxis-audit --deep`;
     usan el `typescript` del proyecto): `type-duplicate-shape` (`minProps`), `inline-shape-extract`
     (`minProps`), `schema-type-redeclare` (`minProps`), y `magic-literal-repeated` (`minFiles`,
     `minLen`; project rule sin AST). Param opcional común `runOn: "full"` para correrlas también
     en la auditoría completa / CI sin pasar `--deep`.
   - **Reglas Tailwind** (autodetect si hay `tailwind.config.*`): `tailwind-arbitrary-values`
     (`allow`), `tailwind-classname-bloat` (`maxClasses`), `tailwind-conditional-concat`,
     `tailwind-duplicate-utilities`.
   - **`commit`**: `{ check, block, minSeverity }` — controla el pre-commit (avisa por
     default; `block: true` aborta el commit si hay findings ≥ `minSeverity`).
   - **Reglas custom** (`.praxis-guard/rules/<id>.mjs`): si el proyecto tiene reglas propias, sus
     ids también se pueden activar/parametrizar en `config.rules[<id>]`. El CLI las reconoce
     (no las marca como desconocidas).
   En modo editar, preguntá SOLO qué quiere cambiar; respetá lo demás.

3. **Construí el objeto config** declarando únicamente lo que difiere de los defaults
   (no repitas valores por defecto). Mismo schema que `config/defaults.json`.

4. **Escribilo** pasando el objeto por stdin:
   `echo '<json>' | node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-config.mjs write --dir <raíz>`
   - Si el CLI sale con error (config inválida), mostrá los mensajes y volvé a preguntar.
     NUNCA escribas a mano el archivo: siempre pasá por el CLI (valida + atómico + meta).

5. **Confirmá** al usuario qué quedó en `.praxis-guard/config.json` y recordale commitearlo.

## Reglas
- No inventes ids de regla: las del catálogo (contenido, arquitectura, TypeScript, Tailwind).
- El hook nunca bloquea; solo el pre-commit puede bloquear y únicamente con `commit.block: true`.
- Si el usuario no quiere configurar nada, no escribas: el detector usa los defaults.
