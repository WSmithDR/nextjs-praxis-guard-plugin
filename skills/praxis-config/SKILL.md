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
   - Qué reglas activar/desactivar: `secrets`, `hardcoded-data`, `forbidden-imports`,
     `file-responsibility`, `untranslated-text`.
   - Umbrales: `file-responsibility.maxLines` (default 400) y `mixedSignalsLines` (200);
     `hardcoded-data.minElements` (8).
   - `forbidden-imports.list`: entradas `{ "module": "...", "message": "..." }`.
   - `untranslated-text`: on/off y `ignore` (textos permitidos).
   En modo editar, preguntá SOLO qué quiere cambiar; respetá lo demás.

3. **Construí el objeto config** declarando únicamente lo que difiere de los defaults
   (no repitas valores por defecto). Mismo schema que `config/defaults.json`.

4. **Escribilo** pasando el objeto por stdin:
   `echo '<json>' | node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-config.mjs write --dir <raíz>`
   - Si el CLI sale con error (config inválida), mostrá los mensajes y volvé a preguntar.
     NUNCA escribas a mano el archivo: siempre pasá por el CLI (valida + atómico + meta).

5. **Confirmá** al usuario qué quedó en `.praxis-guard/config.json` y recordale commitearlo.

## Reglas
- No inventes ids de regla: solo las cinco de arriba.
- El plugin nunca bloquea; esta config solo decide qué avisos ves.
- Si el usuario no quiere configurar nada, no escribas: el detector usa los defaults.
