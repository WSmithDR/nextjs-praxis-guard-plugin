# Reglas de arquitectura + drift + auditoría con disparadores

> Diseño aprobado — 2026-06-15. Extiende el MVP (`docs/specs/2026-06-12-mvp-praxis-hooks-design.md`).
> Cierra los items de backlog Q4 de drift y de auditoría de proyecto completo
> (`.todo/TODO.md`, líneas 53-61).

## Objetivo

Agregar al plugin reglas de **arquitectura** (no solo de contenido de archivo), registrar
en la config qué reglas se aplican, y darle una **auditoría de proyecto completo** con
disparadores deterministas: full audit cuando cambia la versión del plugin o el código de
las reglas; audit incremental (git diff) en caso contrario; y un chequeo previo a cada
commit.

Las tres piezas se diseñan como un solo sistema porque comparten estado
(`.praxis-guard/meta.json`) y la declaración de estrategia de arquitectura.

## No-objetivos (YAGNI)

- **Batching** de archivos para repos grandes: fuera de v1. El motor reporta consolidado;
  se agrega "recién cuando el tamaño del repo lo justifique" (backlog).
- Parsing AST: se mantiene el enfoque regex/heurístico del MVP.
- Cambiar la filosofía "avisa, no bloquea" del hook `PostToolUse`. El único punto que
  puede bloquear es el pre-commit, y solo si el proyecto lo activa explícitamente.

---

## Bloque A — Reglas y config

### A.1 Dos clases de regla

Hoy todas las reglas son **por-archivo**: `(content, path, config) => Finding[]`. La
coherencia de estrategia mira el árbol entero y no encaja en esa firma, así que se
introduce una segunda clase.

| Clase | Firma | Corre en |
|---|---|---|
| **File rule** | `(content, path, config) => Finding[]` | hook `PostToolUse` **y** auditoría (por archivo) |
| **Project rule** | `(projectTree, config) => Finding[]` | **solo** auditoría |

`projectTree` es una estructura liviana derivada del scope (lista de paths in-scope +
metadata mínima: existencia de directorios, ubicación de cada archivo). No lee el contenido
de todos los archivos salvo que la regla lo pida.

`rules/index.mjs` pasa a exportar dos mapas:

```js
export const RULES = { /* file rules */ };
export const PROJECT_RULES = { /* project rules */ };
```

- El hook (`hooks/detect.mjs`) corre solo `RULES`.
- El auditor (`bin/praxis-audit.mjs`) corre `RULES` por archivo + `PROJECT_RULES` una vez.

El tipo `Finding` no cambia: `{ rule, line?, message, severity: 'info'|'warn' }`.

### A.2 Bloque `architecture` en la config

Declarado una vez en `config/defaults.json`, leído por las file rules de arquitectura y por
la project rule:

```jsonc
"architecture": {
  "strategy": null,                 // "by-feature" | "by-layer" | null (sin declarar)
  "root": "src",
  "featuresDir": "src/features",
  "sharedDirs": ["src/shared", "src/lib"]
}
```

`strategy: null` → las reglas de arquitectura no corren aunque estén `enabled`. Es la
puerta principal del opt-in: sin estrategia declarada, cero findings de arquitectura.

### A.3 Reglas nuevas

Todas entran con `enabled: false` en `config/defaults.json` (opt-in, igual patrón que
`forbidden-imports` con `list: []`). Se activan declarando la estrategia vía `praxis-config`.

| Id | Clase | Qué chequea |
|---|---|---|
| `folder-placement` | file | Cada tipo de archivo en su carpeta permitida, vía mapping configurable `kind`→globs (hooks en `**/hooks/`, server actions en `**/_actions/`, components en `**/components/`, …). El tipo se detecta por nombre del archivo y/o señal de contenido. |
| `architecture-coherence` | **project** | Coherencia global con `strategy`. Ej: `by-feature` pero aparece un `src/components/` global que rompe el patrón → reporta drift estructural. |
| `layer-boundaries` | file | Dirección de imports permitida entre capas, por path relativo (ej: `domain` no puede importar de `infra`/`ui`). Configurable. |
| `server-client-boundaries` | file | Reglas Next: un módulo `'use client'` no importa APIs server-only; código server-only no se filtra al cliente. |
| `feature-deps` | file | Una feature no importa los **internos** de otra feature, solo su API pública (index/barrel). Fuerza aislamiento entre features. |

#### Config de ejemplo de las reglas nuevas

```jsonc
"rules": {
  "folder-placement": {
    "enabled": false,
    "placement": [
      { "kind": "hook", "match": "^use[A-Z]", "allowed": ["**/hooks/**"] },
      { "kind": "server-action", "match": "'use server'", "allowed": ["**/_actions/**", "**/actions/**"] }
    ]
  },
  "architecture-coherence": { "enabled": false },
  "layer-boundaries": {
    "enabled": false,
    "layers": [
      { "name": "domain", "path": "src/domain", "mayImport": [] },
      { "name": "infra",  "path": "src/infra",  "mayImport": ["domain"] },
      { "name": "ui",     "path": "src/ui",     "mayImport": ["domain", "infra"] }
    ]
  },
  "server-client-boundaries": { "enabled": false },
  "feature-deps": { "enabled": false, "publicEntry": ["index.ts", "index.tsx"] }
}
```

### A.4 Relación con `forbidden-imports`

`forbidden-imports` se mantiene sin cambios: blocklist de módulos npm/paths. `layer-boundaries`
y `feature-deps` razonan sobre **paths relativos del repo** (capas/features), no sobre módulos
prohibidos. No hay solapamiento real una vez separadas así.

### A.5 Validación

`lib/validate-config.mjs`:
- Suma `architecture` a las claves conocidas; valida `strategy` (enum o null), `root`,
  `featuresDir` (strings), `sharedDirs` (string array).
- Suma las 4 nuevas reglas a `KNOWN_RULES`.
- Valida sus shapes: `placement[]` (`kind`, `match` strings; `allowed` string array),
  `layers[]` (`name`, `path` strings; `mayImport` string array), `publicEntry` (string array).

---

## Bloque B — Drift, auditoría y disparadores

### B.1 Estado en `.praxis-guard/meta.json`

```jsonc
{
  "plugin_version": "0.2.0",
  "reviewed_rules": ["secrets", "folder-placement", ...],
  "rules_fingerprint": "sha256:…",
  "last_audited_commit": "abc123…"
}
```

`rules_fingerprint` = sha256 sobre, en orden estable:
1. lista ordenada de `{ id, enabled }` de las reglas activas,
2. hash del **código fuente** de cada `rules/<id>.mjs` activa (leído en runtime),
3. el bloque `architecture` resuelto,
4. los params relevantes de cada regla activa.

Esto detecta "editaste el código de una regla sin subir la versión del plugin".

### B.2 Drift (Recomendación A del backlog)

- `bin/praxis-config.mjs` escribe `reviewed_rules` + `rules_fingerprint` + `plugin_version`
  en `meta.json` al guardar la config.
- Hook `SessionStart`: si `Object.keys(RULES ∪ PROJECT_RULES) − reviewed_rules ≠ ∅`, ofrece
  correr `praxis-config` en modo editar solo por las reglas nuevas/no revisadas.
- Reusa `meta.json` + `SessionStart` + la skill `praxis-config`. Sin infraestructura nueva.

### B.3 Motor `bin/praxis-audit.mjs`

Determinista, testeable, CLI-agnóstico — patrón gemelo de `bin/praxis-config.mjs`.

**Decisión de modo:**

```
si plugin_version cambió  O  rules_fingerprint cambió   → FULL
si no                                                    → INCREMENTAL
```

- **FULL**: enumera archivos in-scope (`include`/`exclude`), corre file rules (`RULES`) sobre
  cada uno + todas las `PROJECT_RULES`. Al terminar OK, actualiza en `meta.json`:
  `last_audited_commit = HEAD`, `rules_fingerprint`, `plugin_version`.
- **INCREMENTAL**: `git diff --name-only <last_audited_commit>..HEAD` + cambios del working
  tree; filtra por scope; corre file rules sobre esos archivos. Las `PROJECT_RULES` corren
  solo si hubo archivos estructurales agregados/movidos/borrados.

**Flags:**
- `--full` — fuerza FULL ignorando la decisión automática.
- `--staged` — audita solo los archivos staged (para pre-commit).
- `--since <ref>` — incremental contra un ref arbitrario.

Reusa `runDetector` (motor del MVP) para las file rules. Nunca rompe ante error interno
(exit 0 salvo el caso de bloqueo explícito en pre-commit). Si no hay repo git o no hay
`last_audited_commit`, el incremental degrada a FULL.

### B.4 Skill `skills/praxis-audit/SKILL.md`

Envoltorio conversacional que invoca `bin/praxis-audit.mjs` y presenta el reporte. Mismo par
que `praxis-config` (skill) + `bin/praxis-config.mjs` (motor) que ya funciona.

### B.5 Pre-commit (configurable)

- `bin/install-hooks.mjs` suma un target para instalar un git `pre-commit` que corre
  `node bin/praxis-audit.mjs --staged`.
- Config nueva (raíz):

  ```jsonc
  "commit": { "check": true, "block": false, "minSeverity": "warn" }
  ```

  - Default (`block: false`): corre, muestra findings, **exit 0** (no bloquea).
  - `block: true`: si hay findings de severidad ≥ `minSeverity` → **exit 1** (aborta el
    commit). Se saltea con `git commit --no-verify`.
- `validate-config.mjs` valida `commit` (`check`/`block` boolean, `minSeverity` enum).

---

## Componentes a tocar / crear

| Archivo | Cambio |
|---|---|
| `config/defaults.json` | + bloque `architecture`, + 4 reglas (disabled), + bloque `commit` |
| `rules/index.mjs` | exporta `RULES` y `PROJECT_RULES` |
| `rules/folder-placement.mjs` | **nuevo** (file rule) |
| `rules/architecture-coherence.mjs` | **nuevo** (project rule) |
| `rules/layer-boundaries.mjs` | **nuevo** (file rule) |
| `rules/server-client-boundaries.mjs` | **nuevo** (file rule) |
| `rules/feature-deps.mjs` | **nuevo** (file rule) |
| `lib/validate-config.mjs` | valida `architecture`, reglas nuevas, `commit` |
| `lib/fingerprint.mjs` | **nuevo** — calcula `rules_fingerprint` |
| `lib/meta.mjs` | **nuevo** — lee/escribe `.praxis-guard/meta.json` |
| `bin/praxis-audit.mjs` | **nuevo** — motor de auditoría + disparadores |
| `bin/praxis-config.mjs` | escribe `reviewed_rules`/`fingerprint`/`version` en meta.json |
| `bin/install-hooks.mjs` | + target de instalación del git `pre-commit` |
| `hooks/*` (SessionStart) | oferta de drift si hay reglas no revisadas |
| `skills/praxis-audit/SKILL.md` | **nuevo** — wrapper conversacional |
| `test/` | fixtures + casos para reglas nuevas, fingerprint, decisión de modo del auditor |
| `CLAUDE.md` / `README.md` | documentar reglas nuevas, `praxis-audit`, pre-commit, drift |

## Testing

- Fixtures buenas/malas por cada regla nueva (igual que el MVP).
- `architecture-coherence`: fixtures de árbol by-feature coherente vs con `src/components/`
  global intruso.
- `fingerprint`: misma config → mismo hash; cambiar enabled/params/código de regla → hash
  distinto.
- Auditor: tabla de decisión (version igual+fingerprint igual → incremental; cualquiera
  cambia → full; sin git → degrada a full).
- Pre-commit: `block:false` siempre exit 0; `block:true` + finding ≥ minSeverity → exit 1.

## Riesgos

- **Falsos positivos de arquitectura** en proyectos con layout no estándar → mitigado por
  opt-in (`strategy: null` por default) y configurabilidad de placement/layers.
- **Costo del fingerprint** (leer fuente de reglas en cada SessionStart/audit) → es chico
  (pocos archivos `.mjs`); cachear si hiciera falta.
- **Incremental que se pierde cambios** si `last_audited_commit` quedó viejo → el FULL por
  cambio de fingerprint/version cubre el caso; además `--full` siempre disponible.
