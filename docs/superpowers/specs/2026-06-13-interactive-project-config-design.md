# nextjs-praxis-guard — Setup interactivo por proyecto (`praxis-config`)

**Fecha:** 2026-06-13
**Estado:** Diseño aprobado (brainstorming). Pendiente: plan de implementación.

## Qué es

Una capa **interactiva** para configurar el plugin por proyecto, sin editar JSON a mano.
Una skill `praxis-config` te pregunta qué reglas aplicar y con qué parámetros, y persiste
eso en un **directorio dedicado** `.praxis-guard/` dentro del proyecto. Cuando cambiás de
parecer, la re-corrés: te muestra lo actual y editás guiado. El plugin deja de ser
dogmático: actúa según esa config.

> **Lo que YA existe (no se rehace):** el detector ya lee config por-proyecto y hace
> deep-merge sobre `config/defaults.json` (ver `lib/config.mjs`). Esta feature agrega el
> **cómo armás/cambiás** esa config cómodamente y le da una **casa** (`.praxis-guard/`)
> extensible para futuras skills (p. ej. una auditoría de proyecto completo, fuera de v1).

## Decisiones tomadas (brainstorming)

| Decisión | Elección | Razón |
|---|---|---|
| Estructura | **Directorio dedicado `.praxis-guard/`** (no archivo suelto) | Casa del plugin en el proyecto; escala a más skills sin reestructurar. |
| Contenido v1 | **`config.json` + `meta.json`** (enfoque "B") | Config + procedencia liviana. Sin historial (sería "C", se suma después). |
| Disparo | **A demanda + auto-ofrecer** | La skill se invoca cuando querés; además, si falta config en un proyecto Next.js, el plugin lo ofrece (SessionStart, solo Claude Code). |
| Multi-CLI | **Skill en lenguaje neutral (corre en los 5 CLIs); auto-ofrecer solo Claude Code** | El JSON resultante ya lo consume el detector multi-CLI; el hook SessionStart no existe fuera de Claude Code. |
| Git | **`.praxis-guard/config.json` y `meta.json` se commitean** | La config de praxis es del equipo, como un `.eslintrc`: todos corren las mismas reglas. |
| Robustez | **La skill es fina; un script bundled hace la persistencia** | Validación + escritura atómica + estampado de meta en `bin/praxis-config.mjs` (patrón bundled-scripts). CLI-agnóstico y testeable. |

## Arquitectura

```
nextjs-praxis-guard-plugin/
  bin/
    praxis-config.mjs          ← CLI: `show` | `write` (valida, escribe atómico, estampa meta)
  lib/
    config.mjs                 ← (modificado) prioridad de defaultProjectConfigPath
    validate-config.mjs        ← (nuevo) validateConfig(obj) -> { ok, errors }
  hooks/
    praxis-session-offer.mjs   ← (nuevo) auto-ofrecer en SessionStart (Claude Code)
    hooks.json                 ← (modificado) suma bloque SessionStart
  skills/
    praxis-config/
      SKILL.md                 ← (nuevo) flujo interactivo neutral que llama al CLI
  ...                          (manifiestos por CLI + AGENTS.md actualizados)

# En el proyecto donde se usa el plugin (generado por la skill):
<proyecto>/.praxis-guard/
  config.json                  ← reglas + umbrales + listas (lo que lee el detector)
  meta.json                    ← { configured_by, configured_at, plugin_version, schema_version }
```

### Layout de `.praxis-guard/`

`config.json` — mismo schema que el config por-proyecto actual (lo que `loadConfig`
deep-mergea sobre los defaults). Solo declara lo que cambia respecto del default. Ejemplo:

```json
{
  "rules": {
    "untranslated-text": { "enabled": false },
    "file-responsibility": { "maxLines": 300 },
    "forbidden-imports": {
      "list": [{ "module": "lodash", "message": "Usá helpers de /lib." }]
    }
  }
}
```

`meta.json` — procedencia, sin efecto sobre el comportamiento:

```json
{
  "configured_by": "SmithDR",
  "configured_at": "2026-06-13",
  "plugin_version": "0.1.0",
  "schema_version": 1
}
```

## Resolución de config (cambio en `lib/config.mjs`)

`defaultProjectConfigPath(cwd)` suma `.praxis-guard/config.json` como **máxima prioridad**
y conserva las rutas actuales como fallback (backward-compat):

```
1. <cwd>/.praxis-guard/config.json        (nueva, canónica — la escribe la skill)
2. <cwd>/nextjs-praxis-guard.json         (raíz)
3. <cwd>/.config/nextjs-praxis-guard.json
4. <cwd>/.claude/nextjs-praxis-guard.json (compat Claude Code)
```

Devuelve la primera que existe; si ninguna existe, devuelve la canónica
(`.praxis-guard/config.json`) como default. El resto de `loadConfig`/deep-merge no cambia.

## Componentes (unidades aisladas)

### `lib/validate-config.mjs`
- `validateConfig(obj) => { ok: boolean, errors: string[] }`.
- Verifica: `obj` es objeto; `obj.rules` (si está) solo contiene ids conocidos
  (`secrets`, `hardcoded-data`, `forbidden-imports`, `file-responsibility`,
  `untranslated-text`); cada `rules[id].enabled` (si está) es boolean; umbrales numéricos
  (`maxLines`, `mixedSignalsLines`, `minElements`) son números; `forbidden-imports.list`
  (si está) es array de `{ module: string, message?: string }`; `untranslated-text.ignore`
  / `.attributes` (si están) son arrays de strings; `include`/`exclude` (si están) arrays
  de strings. Devuelve mensajes claros por cada problema. No lanza.
- Reusable por el detector para avisar (stderr) ante config inválido y caer a defaults.

### `bin/praxis-config.mjs`
CLI determinista (zero-dep, ESM). Subcomandos:
- `show [--dir <proyecto>]` → imprime en stdout el `config.json` actual (JSON) o `{}` si
  no existe. Exit 0.
- `write [--dir <proyecto>]` → lee un objeto config por **stdin** (JSON), lo valida con
  `validateConfig`; si es inválido, imprime los errores a stderr y exit 1 (no escribe);
  si es válido, escribe `<dir>/.praxis-guard/config.json` de forma **atómica** (escribe a
  `config.json.tmp` y `rename`) y estampa `<dir>/.praxis-guard/meta.json`
  (`configured_by` = `git config user.name` o `"unknown"`; `configured_at` = fecha;
  `plugin_version` = de `.claude-plugin/plugin.json`; `schema_version` = 1). Exit 0.
- `--dir` default = `process.cwd()`.

### `skills/praxis-config/SKILL.md`
Skill en **lenguaje neutral** (sin nombrar tools de un CLI específico; instruye vía
`node bin/praxis-config.mjs`). Flujo:
1. **Leer** estado actual: `node ${PLUGIN_ROOT}/bin/praxis-config.mjs show --dir <proyecto>`.
2. **Modo**: salida `{}` → *first-run* (preguntar todo, con defaults pre-cargados desde
   `config/defaults.json`); salida con contenido → *editar* (mostrar lo actual y preguntar
   qué cambiar).
3. **Preguntar** al usuario (en Claude Code puede usar la UI de opciones; en otros CLIs, en
   el chat): qué reglas activar; umbrales (`file-responsibility.maxLines`/`mixedSignalsLines`,
   `hardcoded-data.minElements`); entradas de `forbidden-imports` (`module` + `message`);
   `untranslated-text` (on/off + `ignore`).
4. **Escribir**: construir el objeto config (solo lo que difiere del default) y pasarlo por
   stdin a `node ${PLUGIN_ROOT}/bin/praxis-config.mjs write --dir <proyecto>`. Si el script
   devuelve errores, mostrarlos y volver a preguntar — nunca escribir a medias.
5. **Confirmar** al usuario qué quedó configurado y dónde (`.praxis-guard/config.json`).

### `hooks/praxis-session-offer.mjs` + bloque `SessionStart`
Solo Claude Code. El script:
1. Detecta proyecto Next.js: hay `next.config.*` o `package.json` con dependencia `next`.
2. Si **no** es Next.js → exit 0 (silencio).
3. Si existe `.praxis-guard/config.json` → exit 0 (ya configurado).
4. Si ya se ofreció antes (marcador por-proyecto en un dir de cache temporal del SO, keyed
   por la ruta del proyecto — **no toca el repo**) → exit 0.
5. Si no → imprime un aviso no bloqueante ("Este proyecto Next.js no tiene config de
   praxis-guard. Para ajustarla, invocá la skill `praxis-config`."), escribe el marcador, y
   exit 0. **Nunca bloquea** (siempre exit 0; no usa exit 2).

## Data flow

```
# Setup
usuario → skill praxis-config
  → `praxis-config.mjs show` (lee estado)
  → Q&A (first-run o editar)
  → arma objeto config
  → `praxis-config.mjs write` (valida → atómico → meta.json)
  → .praxis-guard/config.json + meta.json (commiteados)

# Detección (sin cambios salvo prioridad)
agente edita archivo → hook por-CLI → detect.mjs
  → loadConfig({ projectConfigPath: defaultProjectConfigPath() })
  → defaultProjectConfigPath prioriza .praxis-guard/config.json
  → deep-merge sobre defaults → corre reglas habilitadas

# Auto-ofrecer (Claude Code)
SessionStart → praxis-session-offer.mjs
  → ¿proyecto next? ¿falta config? ¿no ofrecido? → aviso + marcador (exit 0)
```

## Manejo de errores

- `write` **valida antes de escribir**; input inválido → exit 1 + errores por stderr, sin
  tocar el archivo. La skill re-pregunta.
- Escritura **atómica** (tmp + rename): un corte no deja `config.json` corrupto.
- El **auto-ofrecer nunca bloquea** (exit 0 siempre).
- El **detector** ante un `.praxis-guard/config.json` malformado: avisa por stderr
  (vía `validateConfig` / parse fallido) y cae a defaults — nunca rompe la edición.

## Testing

- `lib/config.mjs`: la nueva prioridad — `.praxis-guard/config.json` gana sobre raíz /
  `.config` / `.claude`; si ninguna existe, default = `.praxis-guard/config.json`. Tests con
  temp dirs.
- `lib/validate-config.mjs`: config válida pasa; id de regla desconocido falla; tipo malo
  (p. ej. `maxLines: "300"`) falla; `forbidden-imports.list` mal formada falla; mensajes
  presentes.
- `bin/praxis-config.mjs`: en temp dir — `write` desde stdin crea `config.json` + `meta.json`
  (atómico, contenido correcto, meta estampada); `show` lee lo escrito; input inválido →
  exit 1 sin escribir; `--dir` respetado.
- `hooks/praxis-session-offer.mjs`: ofrece (stdout no vacío) en proyecto next sin config;
  silencio si hay config, si no es next, o si el marcador existe; exit 0 siempre.
- `skills/praxis-config/SKILL.md`: sin test automático (prosa); cubierto por los tests del
  CLI bundled.

## Multi-CLI

- La skill `praxis-config` se descubre/instala por CLI igual que el resto (manifiestos +
  `bin/install-hooks.mjs` ya existentes; agregar el path de la skill donde el CLI lo exija —
  Cursor/Copilot/Codex declaran skills explícitas; Claude Code auto-descubre). Se escribe en
  lenguaje neutral, así corre en los 5.
- El **auto-ofrecer** (SessionStart) es exclusivo de Claude Code. En las demás CLIs, la skill
  se corre a demanda (documentado).
- `AGENTS.md` se actualiza para mencionar la skill `praxis-config` y el directorio
  `.praxis-guard/`.

## Fuera de alcance (v1, YAGNI)

- Historial de cambios / rollback (sería el enfoque "C").
- Configurar `include`/`exclude` globs desde la skill (se editan a mano si hace falta;
  `validateConfig` igual los acepta).
- La skill de **auditoría de proyecto completo** (su propio ciclo spec → plan → impl; el
  directorio `.praxis-guard/` queda listo para alojarla).
- Setup interactivo nativo en CLIs no-Claude más allá del Q&A en chat.
