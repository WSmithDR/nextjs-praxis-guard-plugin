# Respetar `.gitignore` + exclusión guiada de directorios — Diseño

> Diseño aprobado — 2026-06-17. Dos features que reducen el ruido del auditor al adoptarlo en un
> repo real: **(A)** respetar el `.gitignore` (vía git) para no auditar lo que git ignora, y **(B)**
> que la skill `praxis-config` pregunte qué directorios excluir (detectando candidatos de "no-código-propio").

## Objetivo

Que el plugin, desde el arranque en un proyecto, no audite archivos que el repo ya ignora ni
directorios que no son código propio (p. ej. dirs de otros plugins). Hoy solo hay un `exclude` por
**nombre de directorio** con defaults fijos (`node_modules/`, `.next/`, …); no mira el `.gitignore`
ni ayuda a descubrir qué excluir.

## Decisiones (del brainstorming)

| Decisión | Elección |
|---|---|
| Cómo determinar lo ignorado | **git** (`git check-ignore`) — fiel a gitignores anidados, reglas globales y negaciones |
| Activación | **No silenciosa**: flag `respectGitignore`, default `false`; `praxis-config` lo confirma |
| Alcance | **Hook + auditor** (ambos respetan el gitignore) |
| UX de exclusión de dirs (B) | **Detectar candidatos (checklist) + texto libre** |
| Robustez | Fail-open: sin git / sin repo → se comporta como hoy (audita todo). Nunca rompe. |

## No-objetivos (YAGNI)

- **Parser propio de `.gitignore`.** Nos apoyamos en git (decisión del brainstorming).
- **Caché persistente** entre invocaciones del hook. Cada hook procesa un archivo → una llamada
  `git check-ignore` por edición alcanza.
- **Exclusión por path-glob arbitrario** en `exclude`. Sigue siendo por **nombre de directorio**
  (como hoy); para path-specific está el `.gitignore`.
- Cambiar los defaults de `exclude` existentes.

---

## A. Respetar `.gitignore`

### A.1 Módulo nuevo `lib/gitignore.mjs`

Backend git, fail-open. API:

- `gitIgnoreFilter(dir)` → devuelve un **predicado** `(relPath: string) => boolean` (`true` = ignorado),
  para uso **batch** del auditor:
  - Corre `git -C <dir> check-ignore --stdin` pasando los paths candidatos por stdin; arma un `Set`
    de los ignorados; el predicado consulta el Set.
  - Si `dir` no es repo git, git no está, o el comando falla → predicado que devuelve `false` para
    todo (no ignora nada).
- `isGitIgnored(dir, relPath)` → `boolean`, para el **hook** (un archivo): `git -C <dir> check-ignore -q <relPath>`
  (exit 0 = ignorado, 1 = no, otro = error→`false`). Mismo fail-open.

Determinista y robusto: cualquier error de git → `false` (no ignora). Nunca lanza.

### A.2 Flag de config `respectGitignore`

- En `config/defaults.json`: `"respectGitignore": false` (top-level, junto a `include`/`exclude`).
- Default `false` = **off hasta confirmar**. La skill `praxis-config` pregunta y lo escribe (B/§C abajo).
- Cuando es `true`, aplica en hook y auditor (§A.3).

### A.3 Integración

- **Auditor** (`lib/walk.mjs` → `enumerateFiles(dir, config)`): si `config.respectGitignore`, tras
  enumerar los archivos in-scope, filtrar con `gitIgnoreFilter(dir)`. (Una sola llamada batch.)
- **Hook** (`hooks/detect.mjs`): si `config.respectGitignore` y el archivo está in-scope, chequear
  `isGitIgnored(dir, relPath)` antes de correr las reglas; si está ignorado → devolver sin findings.
  - El `dir` del hook es el cwd del proyecto (igual que hoy resuelve la config).

`respectGitignore` es independiente de `exclude`: ambos recortan el universo de archivos a auditar
(primero `exclude` por nombre de dir en el walk, después el filtro gitignore).

---

## B. `praxis-config`: exclusión guiada de directorios

### B.1 Detección de candidatos — `lib/exclude-candidates.mjs` (nuevo)

`suggestExcludeDirs(dir)` → `string[]` (nombres de directorio sugeridos a excluir). Heurística sobre
los dirs de **primer nivel** de `dir`:

- Dot-dirs de tooling/estado conocidos: `.todo`, `.praxis-guard`, `.claude`, `.codex`, `.github`,
  `.vscode`, `.opencode`, `.husky`, `.changeset` (lista mantenible).
- Dirs sin **ningún** archivo cuya extensión esté en `config.include` (no contienen código auditado).
- Excluye de la sugerencia los que ya están en `config.exclude` o son obviamente código (`src`, `app`,
  `components`, `lib`, `pages`).

Determinista, ordenado, sin duplicados. No lee contenido de archivos (solo nombres/extensiones).

### B.2 UX (skill `praxis-config` + `bin/praxis-config.mjs`)

`bin/praxis-config.mjs` es subcomando-based (`cmd = argv[2]`, lee stdin, escribe atómico, emite JSON).
Se le agrega el subcomando **`suggest-excludes --dir <d>`** que corre `suggestExcludeDirs(d)` e imprime
`{ "candidates": ["...", ...] }` a stdout (mismo patrón que el `show` actual).

Flujo de la skill `praxis-config` (un paso nuevo):

1. Preguntar **"¿Respetar el `.gitignore`? (no audita lo que git ignora — recomendado)"** → setea
   `respectGitignore` en el objeto de config a escribir.
2. Correr `praxis-config.mjs suggest-excludes --dir <d>`, leer `candidates`, presentarlos como
   **checklist** (marcás cuáles excluir) **+ una entrada de texto libre** para agregar nombres a mano.
3. Mergear lo elegido en `config.exclude` (sin pisar lo previo; sin duplicados) y escribir vía el path
   de escritura existente del bin.

La skill presenta el menú (coherente con "menús sobre banderas"); `bin/praxis-config.mjs` hace la
detección y la escritura del `.praxis-guard/config.json`.

---

## C. Validación de config

`lib/validate-config.mjs`: aceptar `respectGitignore` (boolean) en el top-level. Si viene con otro
tipo → error de validación claro (como el resto).

---

## D. Tests (del plugin)

- `test/lib/gitignore.test.mjs`: en un repo git temporal con un `.gitignore` (`dist/`, `*.log`),
  `gitIgnoreFilter` marca ignorados los que git ignora y no-ignorados el resto; `isGitIgnored` idem
  por archivo; **directorio sin git** → todo `false` (no ignora). Nunca lanza.
- `test/lib/exclude-candidates.test.mjs`: en un tmp con `.todo/`, `.claude/`, `src/` (con `.tsx`) y
  `assets/` (sin código) → sugiere los dot-dirs y `assets`, no sugiere `src`; respeta `exclude` previo.
- `test/lib/walk.test.mjs` (extender) o nuevo: con `respectGitignore: true`, `enumerateFiles` excluye
  los ignorados; con `false`, los incluye (comportamiento actual intacto).
- Suite verde (`node test/run.mjs`).

## E. Docs

- `README.md`: documentar `respectGitignore` (en *Configuración* + *Referencia de valores*) y el nuevo
  paso de `praxis-config` (exclusión guiada). Aclarar la separación gitignore vs `exclude`.
- `AGENTS.md` / `CLAUDE.md`: una línea en la sección de configuración.

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `lib/gitignore.mjs` | crear (filtro/chequeo git, fail-open) |
| `lib/exclude-candidates.mjs` | crear (sugerir dirs a excluir) |
| `config/defaults.json` | agregar `respectGitignore: false` |
| `lib/walk.mjs` | integrar filtro gitignore en `enumerateFiles` |
| `hooks/detect.mjs` | saltear archivo git-ignored si `respectGitignore` |
| `lib/validate-config.mjs` | aceptar `respectGitignore` (boolean) |
| `bin/praxis-config.mjs` + skill | preguntar gitignore + checklist/texto-libre de dirs |
| `test/lib/gitignore.test.mjs`, `test/lib/exclude-candidates.test.mjs`, `test/lib/walk.test.mjs` | tests |
| `README.md`, `AGENTS.md` | docs |
