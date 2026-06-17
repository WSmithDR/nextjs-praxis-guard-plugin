# bloat project-aware (cva/tailwind-variants) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `tailwind-classname-bloat` personalice su mensaje cuando el proyecto usa cva/tailwind-variants (detectado por package.json).

**Architecture:** `detect-stack` expone `tailwindComponentLib` (reusa el read de package.json). La regla (file rule, sin cambios de detección) ajusta solo el texto del finding.

**Tech Stack:** Node ≥18 ESM, test runner casero.

**Spec:** `docs/specs/2026-06-16-bloat-cva-aware-design.md`

> Autobump activo (sincroniza todos los manifiestos por commit) — esperado.

---

## Task 1: detect-stack `tailwindComponentLib` + mensaje project-aware

**Files:**
- Modify: `lib/detect-stack.mjs`
- Modify: `rules/tailwind-classname-bloat.mjs`
- Test: extend `test/lib/detect-stack-tailwind.test.mjs`, `test/rules/tailwind-classname-bloat.test.mjs`

- [ ] **Step 1: Extender el test de detect-stack (que falle)**

En `test/lib/detect-stack-tailwind.test.mjs`, antes del `console.log('detect-stack-tailwind.test ok')`, agregar:
```js
// tailwindComponentLib desde package.json
const cva = mkdtempSync(join(tmpdir(), 'dscva-'));
writeFileSync(join(cva, 'package.json'), JSON.stringify({ dependencies: { 'class-variance-authority': '^0.7.0' } }));
assert.equal(detectStack(cva).tailwindComponentLib, 'cva');

const tv = mkdtempSync(join(tmpdir(), 'dstv-'));
writeFileSync(join(tv, 'package.json'), JSON.stringify({ devDependencies: { 'tailwind-variants': '^0.2.0' } }));
assert.equal(detectStack(tv).tailwindComponentLib, 'tailwind-variants');

// sin lib -> null (el v4 fixture de arriba `v4` no tiene cva/tv)
assert.equal(detectStack(v4).tailwindComponentLib, null);
```
(`mkdtempSync`, `writeFileSync`, `join`, `tmpdir`, `v4` ya están en ese archivo.)
Run: `node test/lib/detect-stack-tailwind.test.mjs` → FAIL (`tailwindComponentLib` undefined).

- [ ] **Step 2: Modificar `lib/detect-stack.mjs`**

Reemplazar el bloque actual de detección de tailwindcss:
```js
  // v4: tailwindcss en package.json (deps/devDeps) — proyectos CSS-only no tienen config file.
  let hasTwDep = false;
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    hasTwDep = !!((pkg.dependencies && pkg.dependencies.tailwindcss) || (pkg.devDependencies && pkg.devDependencies.tailwindcss));
  } catch { /* sin package.json o no parseable */ }
  const tailwind = !!tailwindConfigPath || hasTwDep;
```
por:
```js
  // package.json: tailwindcss (v4) + librería de componentes/variants (para el aviso de bloat).
  let hasTwDep = false;
  let tailwindComponentLib = null;
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const dep = (n) => (pkg.dependencies && pkg.dependencies[n]) || (pkg.devDependencies && pkg.devDependencies[n]);
    hasTwDep = !!dep('tailwindcss');
    if (dep('class-variance-authority')) tailwindComponentLib = 'cva';
    else if (dep('tailwind-variants')) tailwindComponentLib = 'tailwind-variants';
  } catch { /* sin package.json o no parseable */ }
  const tailwind = !!tailwindConfigPath || hasTwDep;
```
En el objeto de retorno, después de `tailwindThemeSource,` agregar:
```js
    tailwindComponentLib,
```
Run: `node test/lib/detect-stack-tailwind.test.mjs` → PASS.

- [ ] **Step 3: Extender el test de la regla (que falle)**

En `test/rules/tailwind-classname-bloat.test.mjs`, antes del `console.log(...)`, agregar:
```js
// project-aware: con cva en detected -> el mensaje lo nombra
const fullCva = { detected: { tailwind: true, tailwindComponentLib: 'cva' } };
const outCva = rule(bad, 'C.tsx', cfg, fullCva);
assert.equal(outCva.length, 1);
assert.match(outCva[0].message, /Tu proyecto usa cva/);
assert.match(outCva[0].message, /cva/);

// sin lib -> mensaje genérico (no dice "Tu proyecto usa")
assert.doesNotMatch(rule(bad, 'C.tsx', cfg, full)[0].message, /Tu proyecto usa/);
```
Run: `node test/rules/tailwind-classname-bloat.test.mjs` → FAIL (el mensaje no varía).

- [ ] **Step 4: Modificar `rules/tailwind-classname-bloat.mjs`**

Reemplazar el cuerpo del `if (n > maxClasses)`:
```js
    if (n > maxClasses) {
      out.push({ rule: 'tailwind-classname-bloat', line, severity: 'info',
        message: `className con ${n} clases (umbral ${maxClasses}). Extraé a un componente o usá cva/tailwind-variants.` });
    }
```
por:
```js
    if (n > maxClasses) {
      const lib = full.detected && full.detected.tailwindComponentLib;
      const tip = lib
        ? `Tu proyecto usa ${lib}: extraé esta lista a una variante/componente con ${lib}.`
        : 'Extraé a un componente o usá cva/tailwind-variants.';
      out.push({ rule: 'tailwind-classname-bloat', line, severity: 'info',
        message: `className con ${n} clases (umbral ${maxClasses}). ${tip}` });
    }
```
Run: `node test/rules/tailwind-classname-bloat.test.mjs` → PASS.

- [ ] **Step 5: Suite + commit**

Run: `node test/run.mjs` → verde.
```bash
git add lib/detect-stack.mjs rules/tailwind-classname-bloat.mjs test/lib/detect-stack-tailwind.test.mjs test/rules/tailwind-classname-bloat.test.mjs
git commit --no-verify -m "feat(tailwind): bloat project-aware (cva/tailwind-variants via package.json)"
```

---

## Task 2: Docs + cierre

**Files:**
- Modify: `README.md`

- [ ] **Step 1: `README.md`** — en la fila de `tailwind-classname-bloat` de la tabla Tailwind, agregar al final de la celda "Qué detecta":
```markdown
 Si el proyecto usa `cva`/`tailwind-variants` (por `package.json`), el aviso lo nombra.
```
(Editar la celda existente de `tailwind-classname-bloat` para incluir esa frase.)

- [ ] **Step 2: Suite + commit**

Run: `node test/run.mjs` → verde.
```bash
git add README.md
git commit --no-verify -m "docs: aviso de bloat es project-aware (cva/tailwind-variants)"
```

- [ ] **Step 3: Cerrar y mergear**

`todo-plugin:todo-done` para la parte cva (la entrada `@apply` queda pendiente; no cerrarla).
Luego `superpowers:finishing-a-development-branch` para `feat/bloat-cva-aware`.

---

## Self-review (cobertura del spec)

- **§A detect-stack +tailwindComponentLib** → Task 1 (steps 1-2). ✅
- **§B mensaje project-aware** → Task 1 (steps 3-4). ✅
- **§C tests** → Task 1. ✅
- **§D docs** → Task 2. ✅

Sin placeholders. `tailwindComponentLib` definido en detect-stack (Task 1) y consumido por la regla
(mismo nombre). La regla mantiene su firma `(content, filePath, config, full)` y solo cambia el texto.
La parte `@apply` NO entra (queda en el TODO).
