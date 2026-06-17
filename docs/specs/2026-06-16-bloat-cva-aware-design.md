# `tailwind-classname-bloat` project-aware (cva/tailwind-variants) — Diseño

> Diseño aprobado — 2026-06-16. Refina el **mensaje** de la regla existente
> `tailwind-classname-bloat`: si el proyecto usa `cva`/`tailwind-variants` (detectado por
> `package.json`), el aviso sugiere específicamente esa librería en vez del texto genérico. No es
> una regla nueva ni cambia la detección. La parte `@apply` queda como pendiente aparte.

## Objetivo

`tailwind-classname-bloat` ya avisa cuando un `className` supera `maxClasses`, con un mensaje
genérico que menciona "componente o cva/tailwind-variants". Esta iteración lo hace **project-aware**:
cuando el proyecto realmente tiene `cva` o `tailwind-variants` instalado, el mensaje lo nombra y lo
presenta como la abstracción a usar ("ya está en tu proyecto"), más accionable.

## Decisiones (de la divergencia)

| Decisión | Elección |
|---|---|
| Detección de la lib | **`package.json`** (deps/devDeps), no el import por-archivo |
| Dónde | `detect-stack` expone `tailwindComponentLib`; reusa el read de package.json de v4 |
| Alcance | solo el **mensaje** de `tailwind-classname-bloat`; detección/gating sin cambios |
| `@apply` | **fuera** (requiere conciencia de CSS); queda como pendiente en el TODO |
| Empate cva + tailwind-variants | prefiere `cva` |

## No-objetivos (YAGNI)

- **Detectar `@apply`** (escanear CSS, sugerir extraer a utility) — pendiente aparte.
- **Cambiar la detección de bloat** (umbral, qué cuenta como clase) — intacta.
- **Regla nueva** — es un refinamiento de la existente.

---

## A. Detección — `lib/detect-stack.mjs`

Reusando el `pkg` ya leído para la detección de v4 (`tailwindcss` en package.json), agregar:
```js
// librería de componentes/variants Tailwind, para personalizar el aviso de bloat.
let tailwindComponentLib = null;
try {
  const dep = (n) => (pkg.dependencies && pkg.dependencies[n]) || (pkg.devDependencies && pkg.devDependencies[n]);
  if (dep('class-variance-authority')) tailwindComponentLib = 'cva';
  else if (dep('tailwind-variants')) tailwindComponentLib = 'tailwind-variants';
} catch { /* sin package.json */ }
```
> Si la lectura de `package.json` ya está en un `try` para v4, integrar `tailwindComponentLib` dentro de
> ese mismo bloque (un solo parse). Exponerlo en el objeto de retorno: `tailwindComponentLib`.

Zero-dep (mismo read), `null` si no hay lib o package.json.

## B. Mensaje — `rules/tailwind-classname-bloat.mjs`

La regla sigue igual (file rule, gating `detected.tailwind` + jsx, `maxClasses`). Solo cambia el
texto del finding:
```js
const lib = full.detected && full.detected.tailwindComponentLib;
const tip = lib
  ? `Tu proyecto usa ${lib}: extraé esta lista a una variante/componente con ${lib}.`
  : `Extraé a un componente o usá cva/tailwind-variants.`;
// message: `className con ${n} clases (umbral ${maxClasses}). ${tip}`
```
- `info`, `line`, `rule` sin cambios. Comportamiento (cuándo dispara) idéntico.

## C. Tests

- `test/lib/detect-stack-tailwind.test.mjs` (extender): un tmp con `package.json` que tenga
  `class-variance-authority` → `tailwindComponentLib === 'cva'`; otro con `tailwind-variants` →
  `'tailwind-variants'`; uno sin ninguno → `null`.
- `test/rules/tailwind-classname-bloat.test.mjs` (extender, o crear si no existe): un `className` con
  > `maxClasses` clases:
  - con `full.detected.tailwindComponentLib = 'cva'` → el mensaje matchea `/cva/` y `/Tu proyecto usa/`;
  - sin lib → el mensaje genérico (no menciona "Tu proyecto usa").
- Suite verde.

## D. Docs
- `README.md`: en la fila de `tailwind-classname-bloat`, notar que el aviso es **project-aware**
  (nombra `cva`/`tailwind-variants` si están instaladas).
- `skills/praxis-config` / `AGENTS.md`: mención mínima (opcional).

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `lib/detect-stack.mjs` | modificar (+`tailwindComponentLib`) |
| `rules/tailwind-classname-bloat.mjs` | modificar (mensaje project-aware) |
| `test/lib/detect-stack-tailwind.test.mjs` | extender |
| `test/rules/tailwind-classname-bloat.test.mjs` | extender/crear |
| `README.md` (+ AGENTS/skill opcional) | docs |
