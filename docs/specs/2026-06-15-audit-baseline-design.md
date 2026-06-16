# Baseline / suppress para praxis-audit

> Diseño aprobado — 2026-06-15. Hace adoptable la auditoría en repos legacy: aceptás la
> deuda actual una vez y el auditor te muestra solo lo **nuevo**.

## Objetivo

Permitir "aceptar" los findings actuales de un proyecto (la deuda pre-existente) en una
baseline, de modo que `praxis-audit` por defecto muestre solo findings **nuevos**. Sin esto,
correr el auditor en un repo grande existente escupe cientos de findings y nadie lo adopta.

## No-objetivos (YAGNI)

- **Auto-prune** de huellas resueltas en cada corrida (reescribir `baseline.json` en cada run):
  descartado. La limpieza es manual (`--update-baseline`) + un aviso informativo. Cero
  escrituras sorpresa.
- **Distinguir ocurrencias repetidas** del mismo finding en un archivo: la huella no incluye
  la línea, así que dos findings idénticos (misma regla+archivo+mensaje) colapsan en una huella.
  Aceptado a propósito.
- **Baseline por-severidad o por-regla selectiva**: la baseline acepta findings puntuales por
  su huella; no hay niveles. Futuro si hace falta.

---

## A. Modelo de datos y huella

### A.1 `lib/baseline.mjs` (módulo nuevo)

```
findingFingerprint(finding) -> "sha256:<hex>"
   = sha256( finding.rule + '\0' + finding.file + '\0' + finding.message )
   NO incluye la línea (robusto al drift de líneas).

readBaseline(dir) -> { fingerprints: string[], ... } | null
   Lee .praxis-guard/baseline.json. Si no existe o es inválido -> null.

writeBaseline(dir, fingerprints) -> void
   Escribe atómico (tmp + rename, igual que lib/meta.mjs) un objeto
   { created_at, plugin_version, fingerprints }.

applyBaseline(findings, baseline) -> { shown, suppressed, resolvedCount }
   - suppressed: findings cuya huella ∈ baseline.fingerprints.
   - shown: el resto.
   - resolvedCount: cantidad de huellas en la baseline que NO aparecieron entre
     las huellas de `findings` (huérfanas / ya resueltas).
   Si baseline es null -> { shown: findings, suppressed: [], resolvedCount: 0 }.
```

`findingFingerprint` usa `createHash('sha256')` (igual que `lib/fingerprint.mjs`). El `file` y
`message` ya vienen en cada finding del reporte del auditor (el motor agrega `file` al recolectar).

### A.2 `.praxis-guard/baseline.json`

Vive junto a `config.json`/`meta.json` y **se committea** (deuda compartida del equipo):

```json
{
  "created_at": "2026-06-15",
  "plugin_version": "0.2.0",
  "fingerprints": ["sha256:a1b2c3…", "sha256:d4e5f6…"]
}
```

`created_at`/`plugin_version` son informativos; la verdad está en `fingerprints`.

### A.3 Relación con lo existente

No cambia el shape de las reglas ni `meta.json`. La baseline es ortogonal a `rules_fingerprint`
y a `last_audited_commit`. `created_at`/`plugin_version` se obtienen como en `praxis-config.mjs`
(`new Date().toISOString().slice(0,10)` y el `pluginVersion()` que lee `.claude-plugin/plugin.json`).

---

## B. Comandos, filtrado e integración

### B.1 Flags nuevos en `bin/praxis-audit.mjs`

- **`--update-baseline`**: corre un audit **full** (enumera todo el scope, ignora incremental),
  recolecta todos los findings actuales (file rules + project rules), calcula sus huellas
  (deduplicadas) y **reescribe** `baseline.json`. No reporta findings ni bloquea; imprime
  `praxis-audit: baseline actualizada — N aceptados (M resueltos salieron).` donde M = huellas
  que estaban en la baseline vieja y ya no. Exit 0. Es la única vía que escribe la baseline.
- **`--no-baseline`**: ignora la baseline en esta corrida (muestra todo, incluso lo aceptado).
- **Default** (sin flags, con `baseline.json` presente): filtra los aceptados.

### B.2 Filtrado en el flujo normal

Después de recolectar `findings` y ANTES de `report()` / del bloqueo de `--staged`:

```js
const baseline = process.argv.includes('--no-baseline') ? null : readBaseline(dir);
const { shown, suppressed, resolvedCount } = applyBaseline(findings, baseline);
// reportar `shown` (no `findings`)
```

Línea de cierre del reporte:
- Sin baseline activa: como hoy (`N finding(s) en F archivo(s).`).
- Con baseline: `praxis-audit: ${shown.length} nuevo(s) (${suppressed.length} ocultos por baseline). modo ${mode}.`
- Aviso de huérfanas **solo en modo full** (en incremental no se auditó todo, así que
  `resolvedCount` no es confiable): si `mode === 'full' && resolvedCount > 0`:
  `ℹ ${resolvedCount} findings de la baseline ya están resueltos — corré --update-baseline para limpiarlos.`

### B.3 Pre-commit (`--staged`) respeta la baseline

El bloqueo de commit opera sobre `shown` (post-baseline), no sobre `findings` crudos: así
`commit.block: true` **no** bloquea por deuda pre-existente ya aceptada, solo por findings
**nuevos** staged. Reusa el mismo `applyBaseline`. En `--staged` no se calcula aviso de huérfanas
(no es full).

### B.4 Orden de operaciones (dónde encaja)

El flag `--update-baseline` se maneja temprano (como `--fix-tsconfig`): early-exit antes de la
lógica de modo, corriendo su propio full audit para snapshot. El filtrado de baseline se aplica
en el camino normal, después de obtener `findings` y antes de `report()` + del cálculo de
`exitCode` de `--staged`.

---

## C. Componentes a tocar / crear

| Archivo | Cambio |
|---|---|
| `lib/baseline.mjs` | **nuevo** — `findingFingerprint`, `readBaseline`, `writeBaseline`, `applyBaseline` |
| `bin/praxis-audit.mjs` | flags `--update-baseline` (early-exit, snapshot full) y `--no-baseline`; filtrado + línea de cierre + aviso huérfanas; `--staged` bloquea sobre `shown` |
| `skills/praxis-audit/SKILL.md` | documentar baseline (adopción, --no-baseline, limpieza) |
| `README.md`, `AGENTS.md` (CLAUDE.md symlink) | documentar baseline + flujo de adopción en repo legacy |
| `test/` | fingerprint estable; applyBaseline; CLI update/--no-baseline/--staged |

## D. Testing

- `findingFingerprint`: misma `(rule,file,message)` con **línea distinta** → misma huella;
  cambiar `message` o `file` o `rule` → huella distinta.
- `applyBaseline`: separa `shown`/`suppressed` correctamente; `resolvedCount` cuenta las huellas
  de la baseline ausentes en los findings; baseline null → todo en `shown`.
- CLI end-to-end (repo git temporal con config que актива `secrets`):
  - `--update-baseline` escribe `baseline.json` con las huellas actuales.
  - corrida siguiente (default): oculta los baselined, muestra solo un finding nuevo agregado,
    cierre dice "1 nuevo (… ocultos por baseline)".
  - `--no-baseline`: muestra todo.
  - `--staged` con `commit.block: true`: no bloquea si el staged solo trae findings baselined;
    bloquea si trae uno nuevo.
  - aviso de huérfanas: tras resolver un finding baselined, un full audit reporta el `resolvedCount`.

## E. Riesgos

- **Regresión silenciosa**: una huella resuelta sigue en la baseline y, si el problema vuelve,
  se oculta. Mitigado por el aviso de huérfanas (full) que empuja a `--update-baseline`.
- **Colisión de huella** (dos findings idénticos en un archivo) → una sola huella. Aceptado por
  diseño (no-objetivo).
- **Incremental + resolvedCount**: por eso el aviso de huérfanas solo se emite en full.
