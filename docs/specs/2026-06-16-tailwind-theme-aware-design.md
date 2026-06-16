# Tailwind theme-aware (sub-proyecto B) — Diseño

> Diseño aprobado — 2026-06-16. Hace a las reglas Tailwind conscientes del **theme del proyecto**:
> parsea (estáticamente, sin ejecutar) el `tailwind.config.*` y, cuando un valor arbitrario coincide
> con un token declarado, sugiere usar el token. Es el **sub-proyecto B** de "Aprovechar a fondo TS +
> Tailwind"; el A (TypeScript) ya se hizo.

## Objetivo

`tailwind-arbitrary-values` (Fase 1) detecta el patrón `-[…]` con regex pero **no conoce el theme**.
Esta iteración lee el theme y sugiere el token real:

1. **`tailwind-arbitrary-has-token`** _(on)_ — `prefix-[valor]` cuyo valor coincide con un token del
   theme declarado por el proyecto → sugerir `prefix-<token>`. Ej: `bg-[#1a1a1a]` con
   `colors.brand = '#1a1a1a'` → "usá `bg-brand`".
2. **`tailwind-off-theme-value`** _(off, experimental)_ — valor arbitrario de color/spacing que **no**
   matchea ningún token del theme → "este valor no está en tu theme".

## Decisiones (de la divergencia)

| Decisión | Elección |
|---|---|
| Leer el theme | **parseo estático** del config con `ts.createSourceFile` (no ejecuta código del usuario) |
| Reglas | `tailwind-arbitrary-has-token` (on), `tailwind-off-theme-value` (off, experimental) |
| `reward-component-abstraction (@apply/cva)` | **descartada** — no es theme-aware y solapa `tailwind-classname-bloat`; va al TODO como refinamiento de esa regla |
| Alcance de tokens | **solo los declarados por el proyecto** (`theme` / `theme.extend`), no los defaults built-in de Tailwind |
| Clase / nivel | reglas `ast`, `info`, solo en `--deep` (necesitan `ts` para parsear la config) |
| Versiones | **config file** (v3, y v4 con config file); v4 CSS-puro (`@theme`) es no-objetivo (ver abajo) |

## No-objetivos (YAGNI / honestidad)

- **v4 CSS-only (`@theme` en CSS, sin config file).** Hoy `detect-stack` solo detecta Tailwind por
  archivos `tailwind.config.*`; un proyecto v4 CSS-puro ni siquiera dispara las reglas Tailwind. Cubrirlo
  requeriría extender la detección a escanear CSS → **fuera de este spec** (follow-up).
- **Defaults built-in de Tailwind** (`red-500 = #ef4444`, etc.). Requeriría una tabla estática enorme;
  el foco es premiar los tokens **del proyecto**. Un `[#ef4444]` que no esté en tu theme no se sugiere.
- **Theme dinámico** (`require()`, spreads `...defaultTheme`, funciones en el theme). El parseo estático
  los ignora (best-effort); si no se pudo extraer un token, simplemente no se sugiere (falso negativo OK).
- **Fixer automático.** Solo sugiere (`info`).

---

## A. Detección de stack — `lib/detect-stack.mjs`

Extender `detectStack` para exponer la ruta del config (zero-dep, cheap):

```js
const tailwindConfigPath = TAILWIND_CONFIGS.map((f) => join(root, f)).find(existsSync) || null;
// ... en el return:
tailwind,                 // ya existe (boolean)
tailwindConfigPath,       // NUEVO: ruta del config o null
```

Sigue siendo zero-dep (solo `existsSync`). El parseo del theme NO se hace acá (necesita `ts`); se hace
en la regla, en `--deep`.

## B. Parser del theme — `lib/tailwind-theme.mjs`

```js
export function parseTailwindTheme(ts, configPath) { /* → { colors: Map, spacing: Map } | null */ }
```

- Lee el archivo, `ts.createSourceFile(configPath, text, ts.ScriptTarget.Latest, true)` (**solo parsea**).
- Encuentra el **config object literal**: soporta `export default { … }`, `module.exports = { … }`, y
  `const cfg = { … }; export default cfg;` (un hop por identificador). Si no se encuentra → `null`.
- Navega `theme` y `theme.extend`; dentro, los object-literals `colors` y `spacing`.
- Extrae entradas con **valor string-literal**: `Map<valorNormalizado, nombreToken>`.
  - Colores anidados un nivel (`brand: { 500: '#…', DEFAULT: '#…' }`) → nombres `brand-500` / `brand`.
  - Normalización de valor: trim; hex a minúsculas (`#1A1A1A` → `#1a1a1a`). Spacing: string tal cual
    (no se convierten unidades; `0.5rem` solo matchea `0.5rem`).
- Robusto: cualquier nodo inesperado se saltea (no rompe). Devuelve mapas (posiblemente vacíos) o `null`
  si no hubo config object.

> Memoización opcional por `configPath` (las dos reglas lo parsean): un `Map` a nivel de módulo. El
> parseo de un archivo es barato; la memo es nice-to-have, no requisito.

## C. Reglas (`ast`, `--deep`)

Contrato AST: `meta = { kind:'ast' }`, `(ctx, full) => Finding[]`, guard `!ctx.checker`, `info`,
line/file estándar. Gating: `full.detected?.tailwind` y `full.detected?.tailwindConfigPath` presentes;
si no → `[]`. Usan `ctx.ts` + el path para `parseTailwindTheme`, y `extractClassNames(sf.getFullText())`
(reusa `lib/classname.mjs`) sobre los source files `.tsx`/`.jsx`.

Mapa `PREFIX → categoría` (subset conocido): color → `bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|caret|accent`;
spacing → `w|h|min-w|max-w|min-h|max-h|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|inset|top|right|bottom|left|size`.

### C.1 `tailwind-arbitrary-has-token` (default: true)
Para cada `className` extraído, para cada clase que matchee `^(-?[a-z][a-z-]*)-\[([^\]]+)\]$`:
- categoría = `PREFIX[prefix]`; si no está mapeado → skip.
- `val = normalize(category, rawValue)`; buscar en `theme[category]`; si hay token → emitir:

> `Valor arbitrario "${cls}" coincide con el token "${token}" de tu theme. Usá "${prefix}-${token}".`

### C.2 `tailwind-off-theme-value` (default: false, experimental)
Igual recorrido, pero emite cuando la categoría es color/spacing **y** el valor **no** está en el theme:

> `"${cls}" usa un valor que no está en tu theme. Agregalo al theme o usá un token existente.`

Default off (los one-off legítimos la harían ruidosa). No emite para prefijos fuera del mapa color/spacing.

## D. Registro y config
- `rules/index.mjs`: importar las 2 y agregarlas a `AST_RULES`.
- `lib/validate-config.mjs`: 2 ids nuevos a `KNOWN_RULES`.
- `config/defaults.json`:
  ```json
  "tailwind-arbitrary-has-token": { "enabled": true },
  "tailwind-off-theme-value": { "enabled": false }
  ```
- `fingerprint`/runner/praxis-config: sin cambios (iteran `AST_RULES`).

## E. Tests
- `test/lib/tailwind-theme.test.mjs`: fixture config v3 (`theme.extend.colors` con `brand`, anidado
  `brand.500`, y `spacing.sm`) → `parseTailwindTheme` devuelve los mapas esperados; un config sin theme → mapas vacíos;
  un archivo no parseable → no rompe. (Se construye `ts` vía el typescript del repo, como los tests AST.)
- Por regla: fixture `test/fixtures/ast/<regla>/` con `tailwind.config.js` + un `.tsx`:
  - `tailwind-arbitrary-has-token`: positivo `bg-[#1a1a1a]` con `brand:'#1a1a1a'` → sugiere `bg-brand`;
    negativo `bg-[#999999]` (no en theme) → no dispara; negativo `bg-brand` (ya token) → no dispara.
  - `tailwind-off-theme-value`: positivo `bg-[#999999]` (no en theme) → dispara; negativo `bg-[#1a1a1a]` (en theme) → no.
- Registro/defaults extendidos para los 2 ids.
- Suite verde.

## F. Docs
- `AGENTS.md` (=CLAUDE.md) y `README.md`: sumar las 2 reglas theme-aware (notando la experimental off y
  el alcance "solo tokens del proyecto, v3/config-file").
- `praxis-config` skill: ofrecerlas.

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `lib/detect-stack.mjs` | modificar (+`tailwindConfigPath`) |
| `lib/tailwind-theme.mjs` | crear (parser) |
| `rules/tailwind-arbitrary-has-token.mjs` | crear |
| `rules/tailwind-off-theme-value.mjs` | crear |
| `rules/index.mjs` | modificar (AST_RULES += 2) |
| `lib/validate-config.mjs` | modificar (KNOWN_RULES += 2) |
| `config/defaults.json` | modificar |
| `test/lib/tailwind-theme.test.mjs` + fixtures + tests por regla | crear |
| `AGENTS.md`, `README.md`, skill praxis-config | modificar (docs) |
