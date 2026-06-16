# Reglas custom por proyecto

> Diseño aprobado — 2026-06-15. Convierte el plugin en plataforma extensible: el equipo
> escribe sus propias reglas en `.praxis-guard/rules/*.mjs`, cargadas dinámicamente.

## Objetivo

Permitir que cada proyecto defina reglas propias (más allá de las built-in) en
`.praxis-guard/rules/<id>.mjs`, con el mismo contrato que las reglas internas, corriendo
**en el hook (en vivo) y en la auditoría**.

## No-objetivos (YAGNI)

- **Sandboxing** de las reglas custom: son código del equipo, committeado, igual que las
  reglas de ESLint. Corren con los permisos del proceso. No se aísla.
- **Pisar reglas built-in**: un id custom que choca con uno built-in se ignora (gana el
  built-in). No hay override de las internas.
- **Hot-reload**: las custom se cargan una vez por corrida (del hook o del audit). No se
  observan cambios en caliente.

---

## A. Contrato de autoría y carga

### A.1 Ubicación y contrato
Reglas custom en `.praxis-guard/rules/<id>.mjs` (committeables). El **basename es el id**.

```js
// .praxis-guard/rules/no-console.mjs
export default function (content, filePath, config = {}, full = {}) {
  const out = [];
  content.split('\n').forEach((line, i) => {
    if (/\bconsole\.(log|debug)\(/.test(line))
      out.push({ rule: 'no-console', line: i + 1, severity: 'warn', message: 'console.* en producción.' });
  });
  return out;
}
export const meta = { kind: 'project', defaultSeverity: 'info' }; // opcional
```

- **default export**: la función regla. Firma idéntica a las built-in:
  - file rule: `(content, filePath, ruleConfig, fullConfig) => Finding[]`.
  - project rule: `(projectTree, fullConfig) => Finding[]`.
- **`export const meta`** (opcional): `{ kind: 'file' | 'project', defaultSeverity }`. Sin `meta`
  o sin `kind` → file rule. `defaultSeverity` es informativo (la regla pone su propia `severity`
  en cada finding; el plugin no la sobreescribe — `defaultSeverity` queda como dato del meta para
  futuro/documentación, NO se aplica automáticamente para no introducir mutación de findings).

> Nota: el `id` del campo `rule` en cada finding lo decide la regla (se recomienda que coincida
> con el basename). El plugin usa el basename como id para el gating de config.

### A.2 `lib/custom-rules.mjs` (módulo nuevo)
`async loadCustomRules(dir)` → `{ fileRules, projectRules, errors }`:
- `fileRules`: `{ [id]: fn }` de las que son (o defaultean a) `kind: 'file'`.
- `projectRules`: `{ [id]: fn }` de las `kind: 'project'`.
- `errors`: `[{ id, error }]` de las que fallaron al importar o colisionan con un built-in.
- Algoritmo:
  1. Si no existe `<dir>/.praxis-guard/rules/`, devolver `{ fileRules:{}, projectRules:{}, errors:[] }`.
  2. Enumerar `*.mjs` del dir.
  3. Por cada uno: `id = basename sin .mjs`. Si `id ∈ Object.keys(RULES) ∪ Object.keys(PROJECT_RULES)`
     → push a `errors` `{ id, error: 'colisión con regla built-in' }`, saltear.
  4. `import(pathToFileURL(file))` dentro de try/catch. Si falla → `errors` `{ id, error }`, saltear.
  5. Si el `default` no es función → `errors`, saltear.
  6. `kind = (mod.meta && mod.meta.kind) === 'project' ? 'project' : 'file'`. Asignar al mapa.
- Nunca lanza; siempre devuelve los tres campos.

### A.3 Activación
Una regla custom está **on por existir el archivo**. Se apaga/parametriza por
`config.rules[<id>]` (`enabled: false`, params) igual que las built-in.

---

## B. Integración

### B.1 `runDetector` sigue síncrono; el async se aísla en los entry points
`runDetector(filePath, { content, config, customFileRules })` suma el parámetro opcional
`customFileRules` (`{ id: fn }`). El loop de reglas itera el merge:

```js
const allFileRules = { ...customFileRules, ...RULES }; // built-in gana en colisión
for (const [id, fn] of Object.entries(allFileRules)) { ... fn(src, filePath, ruleCfg, cfg) ... }
```

`runDetector` queda sync. La carga async se hace en los entry points:

- **`hooks/hook-adapter.mjs`** (ya es async IIFE): antes de `runDetector`, `const custom =
  await loadCustomRules(process.cwd())`; luego `runDetector(filePath, { customFileRules: custom.fileRules })`.
  El hook nunca rompe: si la carga falla, `loadCustomRules` igual devuelve `{ fileRules:{}, ... }`.
- **`hooks/detect.mjs`** (entry CLI `node hooks/detect.mjs <file>`): el bloque `isMain` pasa a
  IIFE async que carga las custom y las pasa. (En el hook solo corren **file rules** custom; las
  project rules custom corren solo en la auditoría.)

### B.2 Auditoría (`bin/praxis-audit.mjs`)
Es un CLI; carga las custom una vez (`const custom = await loadCustomRules(dir)`) y:
- `runFileRules` itera `{ ...custom.fileRules, ...RULES }` (built-in gana).
- el runner de project rules itera `{ ...custom.projectRules, ...PROJECT_RULES }`.
- `custom.errors` se reportan como líneas informativas (`⚠ regla custom "x" no cargó: <error>`),
  sin abortar.
- Como el top-level del audit ya hace trabajo secuencial, se envuelve en un IIFE async (o el
  top-level del módulo pasa a permitir await — el archivo ya corre como script ESM, top-level
  await está disponible en Node ≥14.8 para módulos `.mjs`).

### B.3 Config y validación
- Las custom participan de `config.rules[<id>]` como las built-in.
- **`lib/validate-config.mjs`**: `validateConfig(obj, extraKnownRules = [])`. La verificación de
  "regla desconocida" usa `KNOWN_RULES ∪ extraKnownRules`. Sin el arg → estricto (caza typos de
  built-ins). `validateConfig` queda **puro** (sin I/O).
- **`bin/praxis-config.mjs`**: en `write`/`show`, `await loadCustomRules(dir)` y pasa los ids
  (`[...Object.keys(fileRules), ...Object.keys(projectRules)]`) como `extraKnownRules`.

### B.4 Drift y fingerprint
- **`lib/fingerprint.mjs`**: `rulesFingerprint(config, customRuleSources = {})` acepta un mapa
  `{ id: sourceString }` opcional; hashea esas fuentes junto a las built-in. Los callers (audit,
  praxis-config) leen el código de los `.mjs` custom y lo pasan. Así editar una custom dispara
  full audit.
- **`reviewed_rules`** (drift): `praxis-config` incluye los ids custom en el snapshot, y
  `hooks/praxis-session-offer.mjs` carga las custom para calcular el set registrado → una regla
  custom nueva dispara la oferta de `praxis-config`. SessionStart sigue siendo no-bloqueante.

### B.5 Errores
- **Hook**: silencioso. Carga o ejecución que falla → se ignora, corren las demás. Nunca rompe.
- **Auditoría**: `errors` de carga se listan (informativo); excepción en runtime de una custom la
  traga el try/catch del loop (igual que las built-in).

---

## C. Componentes a tocar / crear

| Archivo | Cambio |
|---|---|
| `lib/custom-rules.mjs` | **nuevo** — `loadCustomRules(dir)` async |
| `hooks/detect.mjs` | `runDetector` acepta `customFileRules`; entry CLI async carga custom |
| `hooks/hook-adapter.mjs` | carga custom y la pasa a `runDetector` |
| `bin/praxis-audit.mjs` | carga custom (file+project), las pasa a los runners, reporta `errors` |
| `lib/validate-config.mjs` | 2º arg `extraKnownRules` |
| `bin/praxis-config.mjs` | carga custom → `extraKnownRules` + fingerprint con custom |
| `lib/fingerprint.mjs` | `rulesFingerprint(config, customRuleSources)` |
| `hooks/praxis-session-offer.mjs` | incluir ids custom en el set del drift |
| `skills/praxis-config/SKILL.md`, `skills/praxis-audit/SKILL.md`, `README.md`, `AGENTS.md` | documentar |
| `test/` | loader, runDetector con custom, audit con custom, validate con extraKnownRules |

## D. Testing

- **`loadCustomRules`**: dir temporal con una file rule + una project rule (`meta.kind`) → ambas
  cargadas y clasificadas; archivo con syntax error → va a `errors`, las demás cargan; id que
  choca con un built-in (`secrets.mjs`) → ignorado + error; sin dir `rules/` → todo vacío.
- **`runDetector`**: con `customFileRules` corre la custom y respeta `config.rules[id].enabled=false`;
  built-in gana si el mapa custom trae un id built-in.
- **`praxis-audit`**: un `.praxis-guard/rules/<id>.mjs` aparece en el reporte (file y project);
  un archivo roto produce la línea de error sin abortar (exit 0).
- **`validate-config`**: `validateConfig({ rules: { 'mi-regla': {} } })` → inválido;
  `validateConfig(mismo, ['mi-regla'])` → válido.

## E. Riesgos

- **Código arbitrario del proyecto**: las custom ejecutan código. Aceptado (es código del equipo,
  como ESLint custom rules); fuera de alcance el sandboxing.
- **Async en el hook**: `hook-adapter.mjs` ya es async; `detect.mjs` CLI pasa a IIFE async. El
  costo de `loadCustomRules` es un `readdir` + N `import()` — chico, y solo si existe el dir.
- **Colisión de ids**: resuelta a favor del built-in + registrada en `errors`.
- **`validate-config` sin contexto**: mitigado por `extraKnownRules` que pasan los callers que sí
  cargaron las custom.
