# `tailwind-classname-bloat` — sumar `@apply` cuando el proyecto lo usa — Diseño

> Diseño aprobado — 2026-06-16. Complemento de "bloat project-aware (cva)": si el proyecto **ya usa
> `@apply`** (detectado en los CSS convencionales), el aviso de `tailwind-classname-bloat` ofrece
> "extraé a una clase con `@apply`" como alternativa. No empuja `@apply` (patrón algo desaconsejado)
> a quien no lo usa. Cierra el item `@apply` del TODO.

## Objetivo

`@apply` es core de Tailwind: cualquier proyecto puede usarlo, pero la doc prefiere componentes/cva.
Por eso el aviso solo lo menciona cuando el equipo **ya tiene** ese patrón. Señal: un CSS convencional
con una regla `@apply`.

## Decisiones (de la divergencia)

| Decisión | Elección |
|---|---|
| Detección | `detect-stack` escanea los CSS convencionales por `@apply` → `tailwindUsesApply` (bool) |
| Scan | **una sola pasada** sobre `CSS_THEME_CANDIDATES`: setea `tailwindThemeSource` (@theme) y `tailwindUsesApply` (@apply) |
| Mensaje | `tailwind-classname-bloat` agrega "o a una clase con `@apply`" solo si `tailwindUsesApply` |
| Combinación | se compone con la parte cva (`tailwindComponentLib`) ya existente |

## No-objetivos (YAGNI)

- **Escanear todo el CSS del proyecto** por `@apply` (CSS modules dispersos) — best-effort sobre los
  globals convencionales, como el scan de `@theme`.
- **Cambiar la detección de bloat** (umbral, gating) — intacta.

---

## A. Detección — `lib/detect-stack.mjs`

Reemplazar el scan actual (que solo busca `@theme` y solo si no hay config) por **una pasada** que lee
cada candidato una vez:
```js
  let tailwindThemeSource = tailwindConfigPath;
  let tailwindUsesApply = false;
  for (const rel of CSS_THEME_CANDIDATES) {
    const p = join(root, rel);
    let css;
    try { if (!existsSync(p)) continue; css = readFileSync(p, 'utf8'); } catch { continue; }
    if (!tailwindThemeSource && /@theme\b/.test(css)) tailwindThemeSource = p;
    if (/@apply\b/.test(css)) tailwindUsesApply = true;
  }
```
Exponer `tailwindUsesApply` en el retorno. Zero-dep, acotado (≤6 reads). (Ahora lee los candidatos
también cuando hay config v3 —para detectar `@apply`—, pero sigue siendo trivial.)

## B. Mensaje — `rules/tailwind-classname-bloat.mjs`

```js
const det = full.detected || {};
const lib = det.tailwindComponentLib;
const apply = det.tailwindUsesApply ? ' o a una clase con @apply' : '';
const tip = lib
  ? `Tu proyecto usa ${lib}: extraé esta lista a una variante/componente con ${lib}${apply}.`
  : `Extraé a un componente o usá cva/tailwind-variants${apply}.`;
// message: `className con ${n} clases (umbral ${maxClasses}). ${tip}`
```
Detección/gating/firma sin cambios.

## C. Tests

- `test/lib/detect-stack-tailwind.test.mjs` (extender): un tmp con un `app/globals.css` que contenga
  `.btn { @apply px-4 py-2; }` → `tailwindUsesApply === true`; un proyecto sin `@apply` (p. ej. el `v4`
  con solo `@theme`) → `false`.
- `test/rules/tailwind-classname-bloat.test.mjs` (extender): className > maxClasses con
  `detected.tailwindUsesApply = true` → mensaje matchea `/@apply/`; sin → no menciona `@apply`. Y la
  combinación cva + apply (`tailwindComponentLib:'cva'` + `tailwindUsesApply:true`) menciona ambos.
- Suite verde.

## D. Docs
- `README.md`: en la fila de `tailwind-classname-bloat`, agregar que si el proyecto usa `@apply`, el
  aviso también lo ofrece.

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `lib/detect-stack.mjs` | modificar (scan unificado + `tailwindUsesApply`) |
| `rules/tailwind-classname-bloat.mjs` | modificar (mensaje con `@apply`) |
| `test/lib/detect-stack-tailwind.test.mjs` | extender |
| `test/rules/tailwind-classname-bloat.test.mjs` | extender |
| `README.md` | docs |
