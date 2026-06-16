# Salida SARIF + GitHub Action (CI) — Diseño

> Diseño aprobado — 2026-06-16. Lleva la auditoría de `praxis-guard` al pipeline de CI:
> `praxis-audit --format sarif` emite los findings en SARIF 2.1.0 (estándar neutral) y un
> workflow de GitHub Action los sube como anotaciones en el PR (code scanning), pudiendo
> frenar el merge. Saca el chequeo del loop del agente: pasa siempre, para todos, sin depender
> de quién tenga el plugin instalado.

## Objetivo

Hoy la revisión depende de que alguien con el plugin instalado lo corra localmente (hook
por-archivo o `praxis-audit`). Esta feature la lleva al servidor (CI):

1. **`praxis-audit --format sarif`** — traduce los findings (ya estructurados:
   `{rule, file, line, severity, message}`) al formato **SARIF 2.1.0**, un JSON estándar que
   GitHub code scanning (y GitLab, Azure, etc.) sabe leer. Es el núcleo **agnóstico**: no ata a
   ningún CLI ni a GitHub.
2. **Workflow de GitHub Action** — un template que se instala en el proyecto consumidor
   (`.github/workflows/praxis-audit.yml`) vía el mismo patrón git-based de `install-hooks`. En
   cada PR corre el audit profundo y sube el SARIF → anotaciones inline + (opcional) frena el merge.

## Decisiones (de la divergencia)

| Decisión | Elección |
|---|---|
| Target | proyecto consumidor administrado con git; multi-CLI agnóstico |
| Núcleo agnóstico | `--format sarif` (estándar neutral); el GitHub Action es **un** consumidor |
| Plugin en CI | **git clone fijado** del repo del plugin (Enfoque A); `install-hooks` inyecta url+ref |
| Gating | configurable, default `warn`; lee `config.commit.minSeverity`; solo findings **nuevos** (baseline) |
| Profundidad CI | **profundo** (`npm ci` + `--full --deep`) — el lugar natural para el análisis lento |
| Frenar el PR | sí (el workflow pasa `--gate`); el umbral es configurable |

## No-objetivos (YAGNI)

- **Publicar el plugin en npm / como GitHub Action publicada.** Sigue siendo plugin git-distribuido;
  el CI lo clona.
- **Config nueva.** El gate reusa `commit.minSeverity`; no se agrega un bloque `ci`.
- **Otros formatos** (`--format json`, etc.). Solo `human` (default) y `sarif`.
- **Otros CIs** (GitLab/Azure templates). El SARIF ya los habilita; los templates concretos, futuro.

---

## A. Formateador SARIF — `lib/sarif.mjs`

Módulo puro, zero-dep:

```js
export function toSarif(findings, { toolName, toolVersion, informationUri } = {}) { /* → objeto SARIF 2.1.0 */ }
```

- **Estructura:** `{ version: '2.1.0', $schema, runs: [ { tool: { driver }, results } ] }`.
  - `driver.name = toolName` (`'nextjs-praxis-guard'`), `driver.version = toolVersion`,
    `driver.informationUri`, `driver.rules` = un `reportingDescriptor` por **regla distinta** vista
    (`{ id, name }`, name = el id).
- **`results`:** uno por finding:
  - `ruleId = f.rule`
  - `level`: mapeo `info→note`, `warn→warning`, `error→error` (default `note`).
  - `message.text = f.message`
  - `locations[0].physicalLocation.artifactLocation.uri = f.file` (relativo al repo) y, si
    `f.line != null`, `region.startLine = f.line`. Sin `region` si no hay línea (findings de proyecto).
  - `partialFingerprints.praxisFingerprint = findingFingerprint(f)` (dedup estable entre corridas).
- **Determinismo:** los findings se ordenan estable por `(file, line ?? 0, rule, message)` antes de
  emitir; sin timestamps; paths relativos. Mismo árbol → SARIF byte-idéntico (testeable).
- `findingFingerprint` se importa de `lib/baseline.mjs` (ya existe).

## B. Wiring en el runner — `bin/praxis-audit.mjs`

### B.1 Flag `--format <human|sarif>` (default `human`)
- En modo `sarif`: a **stdout** va **solo** `JSON.stringify(toSarif(shown, ...))`. Todo el ruido
  humano (aviso "reglas AST omitidas", línea de modo, baseline) se redirige a **stderr** o se
  omite. Así el workflow hace `> praxis.sarif` sin corromper el JSON.
- El SARIF lleva los findings **mostrados** (`shown`, post-baseline = solo nuevos). `--no-baseline`
  incluye todo. Coherente con el reporte humano.
- `report()` (humano) queda igual; se elige formateador según el flag.

### B.2 Flag `--gate` (ortogonal al formato)
- Si está presente: el proceso hace **`exit 1`** cuando `shown` tiene algún finding de severidad
  ≥ `config.commit.minSeverity` (default `warn`). Si no, `exit 0`.
- Reusa la lógica de rank que hoy vive en el bloque `--staged` (`commit.block`). Se **extrae** a un
  helper `gateExitCode(shown, config)` (en `bin/praxis-audit.mjs` o `lib/`) usado por ambos caminos
  (`--staged` con `commit.block`, y `--gate`).
- `--gate` funciona en cualquier modo; el workflow usa `--full --deep --format sarif --gate`.

> Orden de efectos: el SARIF se escribe en stdout **antes** del `exit 1`, así el workflow puede
> subirlo aunque el job falle.

## C. Workflow + instalación

### C.1 Template `cli/github-action.yml`
Template con placeholders que `install-hooks` reemplaza (`__PLUGIN_URL__`, `__PLUGIN_REF__`):

```yaml
name: praxis-guard
on: pull_request
permissions:
  contents: read
  security-events: write   # requerido para upload-sarif
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci                       # para que typescript resuelva en --deep
      - name: clone praxis-guard plugin
        run: git clone --depth 1 --branch __PLUGIN_REF__ __PLUGIN_URL__ "$RUNNER_TEMP/praxis-plugin"
        # repo privado: usar https con ${{ secrets.PRAXIS_PLUGIN_TOKEN }} (ver README)
      - name: praxis-audit
        id: audit
        continue-on-error: true
        run: node "$RUNNER_TEMP/praxis-plugin/bin/praxis-audit.mjs" --full --deep --format sarif --gate > praxis.sarif
      - name: upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: praxis.sarif }
      - name: gate
        if: steps.audit.outcome == 'failure'
        run: exit 1
```

El plugin tiene **zero runtime deps** (typescript es peer del proyecto consumidor), así que el
clone no necesita `npm ci` adentro.

### C.2 `install-hooks.mjs --cli github-action`
- Nuevo case `github-action`: escribe `cli/github-action.yml` en `<target>/.github/workflows/praxis-audit.yml`,
  reemplazando `__PLUGIN_URL__` por `git -C PLUGIN_ROOT remote get-url origin` y `__PLUGIN_REF__`
  por la versión del plugin (tag `v<version>` de `plugin.json`) — o el SHA de HEAD como fallback.
- Sigue el patrón de los otros cases (copilot/codex/opencode/precommit): `writeHookFile`-like.

## D. Config
Sin config nueva. El gate usa `config.commit.minSeverity` (default `warn`), ya validado por
`validate-config`.

## E. Tests
- **`test/lib/sarif.test.mjs`:** un array de findings de ejemplo → `toSarif(...)`:
  - asserts de estructura (`version 2.1.0`, `runs[0].tool.driver.name/version`, `rules` deduplicadas,
    `results` con `ruleId/level/message/uri/startLine/partialFingerprints`);
  - mapeo de level (`info→note`, `warn→warning`, `error→error`);
  - finding sin línea → result sin `region`;
  - **determinismo:** dos llamadas con la misma entrada → `JSON.stringify` idéntico; orden estable
    ante entrada desordenada.
- **`test/bin/praxis-audit-sarif.test.mjs`:** corre `node bin/praxis-audit.mjs --full --format sarif --dir <fixture>`
  sobre un fixture con un finding conocido → stdout parsea como SARIF y contiene el result; stderr no
  contamina stdout. Y `--gate`: exit 1 con un finding ≥ `warn`, exit 0 sin él.
- **`test/bin/install-github-action.test.mjs`:** `install-hooks --cli github-action --target <tmp>` →
  existe `<tmp>/.github/workflows/praxis-audit.yml` con la url y el ref inyectados (sin placeholders
  `__...__` sin reemplazar).
- El `.yml` template en sí no se testea (es template); se testea su **generación**.

## F. Docs
- README + AGENTS.md (=CLAUDE.md): documentar `--format sarif`, `--gate`, el install
  `--cli github-action`, y la nota de repo privado (token).
- Skill `praxis-audit`: mención del modo SARIF/CI (no es UX humana cotidiana — es plomería de CI).

---

## Resumen de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/sarif.mjs` | crear | `toSarif(findings, meta)` → SARIF 2.1.0 (puro, determinista) |
| `bin/praxis-audit.mjs` | modificar | flags `--format` y `--gate`; stdout limpio; helper `gateExitCode` |
| `cli/github-action.yml` | crear | template del workflow con placeholders |
| `bin/install-hooks.mjs` | modificar | case `github-action`: genera el `.yml` con url/ref inyectados |
| `test/lib/sarif.test.mjs` | crear | estructura + determinismo del formateador |
| `test/bin/praxis-audit-sarif.test.mjs` | crear | `--format sarif` + `--gate` end-to-end |
| `test/bin/install-github-action.test.mjs` | crear | generación del workflow |
| README, AGENTS.md, skill praxis-audit | modificar | docs |
