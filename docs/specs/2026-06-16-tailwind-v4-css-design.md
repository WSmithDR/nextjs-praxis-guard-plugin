# Tailwind v4 CSS-only (@theme) — Diseño

> Diseño aprobado — 2026-06-16. Cierra el follow-up del sub-proyecto B: hace que las reglas
> theme-aware funcionen también en proyectos **Tailwind v4 sin `tailwind.config.*`**, donde el
> theme vive en CSS (`@theme { --color-…; --spacing-… }`). Hoy esos proyectos **ni se detectan**
> (`detect-stack` solo mira archivos de config).

## Objetivo

Tailwind v4 movió la config a CSS. Un proyecto v4 CSS-puro no tiene `tailwind.config.*`, así que:
- `detect-stack` reporta `tailwind: false` → ninguna regla Tailwind corre.
- `tailwind-theme.mjs` solo parsea configs JS/TS.

Esta iteración: detectar v4 por `package.json` + ubicar el CSS con `@theme`, y parsear sus tokens.
Las 2 reglas theme-aware (de B) no cambian su lógica de match — solo de dónde sale el theme.

## Decisiones (de la divergencia)

| Decisión | Elección |
|---|---|
| Detección | `tailwind: true` si hay config file **o** `tailwindcss` en `package.json` (deps/devDeps) |
| Theme source | config file (v3) **o** primer CSS **convencional** con `@theme` (lista corta); si no, `null` |
| Parseo CSS | regex sobre los bloques `@theme { … }`; namespaces `--color-*` y `--spacing-*` |
| Naming v4 | token = lo que sigue a `--color-`/`--spacing-` (`--color-brand` → `bg-brand`) |
| Reglas | gatean/parsean por `tailwindThemeSource` (en vez de `tailwindConfigPath`); match idéntico |

## No-objetivos (YAGNI)

- **Escaneo completo de todos los `.css`** del proyecto (se eligió la lista de paths convencionales por
  costo en el hook). Layouts no convencionales no se cubren (best-effort).
- **`@import` anidados / `@config` apuntando a un JS** — solo se lee el `@theme` del CSS encontrado.
- **Otros namespaces v4** (`--font-*`, `--radius-*`, `--breakpoint-*`) — las reglas son color/spacing.

---

## A. Detección — `lib/detect-stack.mjs`

```js
const CSS_THEME_CANDIDATES = ['app/globals.css', 'src/app/globals.css', 'styles/globals.css',
                              'src/index.css', 'src/styles/globals.css', 'app/styles/globals.css'];

// tailwind: config file O tailwindcss en package.json.
const hasTwDep = /* lee package.json (deps+devDeps), busca 'tailwindcss' */;
const tailwind = !!tailwindConfigPath || hasTwDep;

// theme source: config (v3) o el primer CSS convencional que contenga @theme.
let tailwindThemeSource = tailwindConfigPath || null;
if (!tailwindThemeSource) {
  for (const rel of CSS_THEME_CANDIDATES) {
    const p = join(root, rel);
    if (existsSync(p)) { try { if (/@theme\b/.test(readFileSync(p, 'utf8'))) { tailwindThemeSource = p; break; } } catch {} }
  }
}
```
- `package.json`: lee + parsea tolerante (try/catch); `hasTwDep` = `'tailwindcss' in {...deps, ...devDeps}`.
- Mantiene `tailwindConfigPath` (v3). Agrega `tailwindThemeSource`. Zero-dep, acotado (≤6 reads chicos).
- Robusto: cualquier fallo de lectura → se ignora; `tailwindThemeSource` puede ser `null`.

## B. Parser — `lib/tailwind-theme.mjs`

`parseTailwindTheme(ts, source)` despacha por extensión:
- `source` termina en `.css` → **`parseCssTheme(text)`** (no usa `ts`).
- si no → el parser de config JS/TS actual (sin cambios).

`parseCssTheme(text)`:
```js
// extrae los bloques @theme { … } y, dentro, las custom props --color-*/--spacing-*.
const colors = new Map(), spacing = new Map();
for (const block of text.matchAll(/@theme[^{]*\{([\s\S]*?)\}/g)) {
  for (const m of block[1].matchAll(/--(color|spacing)-([A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, ns, name, raw] = m;
    if (ns === 'color') colors.set(normalizeColor(raw.trim()), name);
    else spacing.set(raw.trim(), name);
  }
}
return { colors, spacing };
```
- Token v4: `--color-brand` → `brand`; `--color-accent-500` → `accent-500`. La sugerencia `bg-brand` sale igual.
- Reusa `normalizeColor` de `lib/tailwind-classes.mjs` (misma normalización que el match className-side).
- Robusto: si no hay `@theme` → mapas vacíos; nunca lanza.

## C. Reglas — cambio mínimo

`rules/tailwind-arbitrary-has-token.mjs` y `rules/tailwind-off-theme-value.mjs`:
- Gate: `if (!det.tailwind || !det.tailwindThemeSource) return [];` (antes `tailwindConfigPath`).
- Parseo: `parseTailwindTheme(ctx.ts, det.tailwindThemeSource)`.
- El resto (scan de className, match, mensaje) idéntico.

## D. Tests

- `test/lib/detect-stack-tailwind.test.mjs` (extender): fixture v4 CSS-only en tmp (un `package.json` con
  `tailwindcss` en devDeps + `app/globals.css` con `@theme { --color-brand:#1a1a1a }`, **sin** config) →
  `tailwind:true`, `tailwindThemeSource` termina en `globals.css`. Y un proyecto sin tailwind → `tailwind:false`,
  `tailwindThemeSource:null`.
- `test/lib/tailwind-theme.test.mjs` (extender): `parseTailwindTheme(ts, <ruta .css>)` sobre
  `@theme { --color-brand:#1A1A1A; --spacing-sm:0.5rem }` → `colors.get('#1a1a1a')==='brand'`,
  `spacing.get('0.5rem')==='sm'`. (`ts` se pasa pero el branch CSS no lo usa.)
- Actualizar `test/rules/tailwind-arbitrary-has-token.test.mjs` y `tailwind-off-theme-value.test.mjs`:
  pasar `tailwindThemeSource` en `full.detected` (en vez de/además de `tailwindConfigPath`).
- Un test de regla end-to-end con fixture v4 CSS (config en `.css`) opcional pero recomendado: que la
  estrella sugiera `bg-brand` leyendo el theme del CSS.
- Suite verde.

## E. Docs
- `AGENTS.md` / `README.md` / skill `praxis-config`: sacar el "v4 CSS-only es follow-up" y notar que
  ahora **también** se cubre (vía `@theme` en CSS, detección por `package.json`).

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `lib/detect-stack.mjs` | modificar (+`tailwindThemeSource`, detección por package.json) |
| `lib/tailwind-theme.mjs` | modificar (+`parseCssTheme` + dispatch por extensión) |
| `rules/tailwind-arbitrary-has-token.mjs` | modificar (gate/parse por `tailwindThemeSource`) |
| `rules/tailwind-off-theme-value.mjs` | modificar (ídem) |
| `test/lib/*` + `test/rules/*` + fixtures | crear/extender |
| `AGENTS.md`, `README.md`, skill praxis-config | docs (sacar follow-up) |
