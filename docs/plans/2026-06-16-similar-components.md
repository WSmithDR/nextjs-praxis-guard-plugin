# Auditor de componentes similares — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `praxis-similar-components`: motor determinista que detecta componentes React parecidos por firma estructural (JSX + hooks) y los agrupa; skill que presenta los grupos y sugiere unificar.

**Architecture:** `lib/component-fingerprint.mjs` (extraer componentes + fingerprint + similarity) → `lib/similar-components.mjs` (agrupar por union-find) → `bin/similar-components.mjs` (enumera in-scope, JSON a stdout) → `skills/praxis-similar-components/SKILL.md`.

**Tech Stack:** Node ≥18 ESM, TS parser (peer), test runner casero.

**Spec:** `docs/specs/2026-06-16-similar-components-design.md`

> Autobump activo (sincroniza todos los manifiestos) — esperado.

---

## Task 1: `lib/component-fingerprint.mjs`

**Files:**
- Create: `lib/component-fingerprint.mjs`
- Test: `test/lib/component-fingerprint.test.mjs`

- [ ] **Step 1: Failing test** — `test/lib/component-fingerprint.test.mjs`:
```js
import assert from 'node:assert/strict';
import ts from 'typescript';
import { extractComponents, fingerprintComponent, similarity } from '../../lib/component-fingerprint.mjs';

function parse(code) { return ts.createSourceFile('x.tsx', code, ts.ScriptTarget.Latest, true); }

const sf = parse(`
export function Card(props) {
  const [open, setOpen] = useState(false);
  return <div><h2>{props.t}</h2><button onClick={() => setOpen(true)}>x</button></div>;
}
function notAComponent() { return 5; }
`);
const comps = extractComponents(ts, sf);
assert.equal(comps.length, 1, `comps=${comps.length}`);
assert.equal(comps[0].name, 'Card');

const fp = fingerprintComponent(ts, comps[0].fnNode);
assert.equal(fp.elements.get('div'), 1);
assert.equal(fp.elements.get('button'), 1);
assert.equal(fp.size, 3);            // div, h2, button
assert.ok(fp.hooks.has('useState'));

// similarity: igual a sí mismo = 1; vs distinto < 1
assert.equal(similarity(fp, fp), 1);
const fp2 = fingerprintComponent(ts, extractComponents(ts, parse('export function S(){ return <span>x</span>; }'))[0].fnNode);
assert.ok(similarity(fp, fp2) < 1);

console.log('component-fingerprint.test ok');
```
Run: `node test/lib/component-fingerprint.test.mjs` → FAIL (module not found). (Si `import ts from 'typescript'` no da el objeto, usar `import * as ts`.)

- [ ] **Step 2: Implement** — `lib/component-fingerprint.mjs`:
```js
// lib/component-fingerprint.mjs
// Fingerprint estructural de un componente React (multiset de tipos de elemento JSX + hooks)
// y similitud (Jaccard ponderado). Parser-only, no ejecuta nada.

function hasJsx(ts, node) {
  let found = false;
  (function visit(n) {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) { found = true; return; }
    ts.forEachChild(n, visit);
  })(node);
  return found;
}

// Componentes top-level: function decl o const arrow/fn cuyo cuerpo tiene JSX.
export function extractComponents(ts, sf) {
  const out = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body && hasJsx(ts, st)) out.push({ name: st.name.text, fnNode: st });
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (d.name && ts.isIdentifier(d.name) && d.initializer
            && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) && hasJsx(ts, d.initializer)) {
          out.push({ name: d.name.text, fnNode: d.initializer });
        }
      }
    }
  }
  return out;
}

export function fingerprintComponent(ts, fnNode) {
  const elements = new Map();
  const hooks = new Set();
  let size = 0;
  (function visit(n) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText();
      elements.set(tag, (elements.get(tag) || 0) + 1);
      size++;
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^use[A-Z]/.test(n.expression.text)) hooks.add(n.expression.text);
    ts.forEachChild(n, visit);
  })(fnNode);
  return { elements, hooks, size };
}

function weightedJaccard(a, b) {
  const tags = new Set([...a.keys(), ...b.keys()]);
  if (!tags.size) return 1;
  let inter = 0, uni = 0;
  for (const t of tags) { const x = a.get(t) || 0, y = b.get(t) || 0; inter += Math.min(x, y); uni += Math.max(x, y); }
  return uni ? inter / uni : 1;
}
function setJaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  const uni = new Set([...a, ...b]).size;
  return uni ? inter / uni : 1;
}

export function similarity(a, b) {
  return 0.8 * weightedJaccard(a.elements, b.elements) + 0.2 * setJaccard(a.hooks, b.hooks);
}
```
Run → PASS. (`n.tagName.getText()` es seguro con `setParentNodes=true` en `createSourceFile`, que el caller usa.)

- [ ] **Step 3: Commit**
```bash
git add lib/component-fingerprint.mjs test/lib/component-fingerprint.test.mjs
git commit --no-verify -m "feat(similar): fingerprint estructural de componentes + similarity"
```

---

## Task 2: `lib/similar-components.mjs`

**Files:**
- Create: `lib/similar-components.mjs`
- Test: `test/lib/similar-components.test.mjs`

- [ ] **Step 1: Failing test** — `test/lib/similar-components.test.mjs`:
```js
import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSimilarGroups } from '../../lib/similar-components.mjs';

const dir = mkdtempSync(join(tmpdir(), 'simc-'));
const a = join(dir, 'CardA.tsx');
writeFileSync(a, 'export function Card(props){ return <div><h2>{props.title}</h2><p>{props.body}</p><button>a</button></div>; }');
const b = join(dir, 'CardB.tsx');
writeFileSync(b, 'export function CardB(props){ return <div><h2>{props.t}</h2><p>{props.b}</p><button>x</button></div>; }');
const o = join(dir, 'Other.tsx');
writeFileSync(o, 'export function Other(){ return <span>hi</span>; }');

const groups = findSimilarGroups(ts, [a, b, o], { threshold: 0.8, minElements: 2 });
assert.equal(groups.length, 1, `groups=${groups.length}`);
assert.equal(groups[0].components.length, 2);
assert.deepEqual(groups[0].components.map((c) => c.name).sort(), ['Card', 'CardB']);
assert.ok(groups[0].similarity >= 0.8, `sim=${groups[0].similarity}`);
assert.ok(!groups.some((g) => g.components.some((c) => c.name === 'Other')), 'Other no agrupa (size < min)');

// idénticos (mismo árbol) -> sim 1
const d = join(dir, 'Dup.tsx');
writeFileSync(d, 'export function Dup(props){ return <div><h2>{props.title}</h2><p>{props.body}</p><button>a</button></div>; }');
const g2 = findSimilarGroups(ts, [a, d], { threshold: 0.9, minElements: 2 });
assert.equal(g2.length, 1);
assert.equal(g2[0].similarity, 1);

// mismo archivo no agrupa consigo mismo (dos componentes en un archivo)
const e = join(dir, 'Two.tsx');
writeFileSync(e, 'export function P(){ return <div><h2/><p/><button/></div>; }\nexport function Q(){ return <div><h2/><p/><button/></div>; }');
assert.equal(findSimilarGroups(ts, [e], { threshold: 0.8, minElements: 2 }).length, 0, 'mismo archivo no cuenta');

console.log('similar-components.test ok');
```
Run: `node test/lib/similar-components.test.mjs` → FAIL (module not found).

- [ ] **Step 2: Implement** — `lib/similar-components.mjs`:
```js
// lib/similar-components.mjs
// Agrupa componentes parecidos entre archivos por similitud de fingerprint (union-find).
import { readFileSync } from 'node:fs';
import { extractComponents, fingerprintComponent, similarity } from './component-fingerprint.mjs';

export function findSimilarGroups(ts, files, { threshold = 0.85, minElements = 3 } = {}) {
  const comps = [];
  for (const file of files) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    let sf;
    try { sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true); } catch { continue; }
    for (const c of extractComponents(ts, sf)) {
      const fp = fingerprintComponent(ts, c.fnNode);
      if (fp.size >= minElements) comps.push({ file, name: c.name, fp });
    }
  }

  const parent = comps.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { parent[find(i)] = find(j); };
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      if (comps[i].file === comps[j].file) continue;
      if (similarity(comps[i].fp, comps[j].fp) >= threshold) union(i, j);
    }
  }

  const byRoot = new Map();
  for (let i = 0; i < comps.length; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(i);
  }

  const groups = [];
  for (const members of byRoot.values()) {
    if (members.length < 2) continue;
    let minSim = 1;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const s = similarity(comps[members[a]].fp, comps[members[b]].fp);
        if (s < minSim) minSim = s;
      }
    }
    groups.push({
      similarity: Math.round(minSim * 100) / 100,
      components: members.map((m) => ({ file: comps[m].file, name: comps[m].name })),
    });
  }
  groups.sort((a, b) => b.similarity - a.similarity);
  return groups;
}
```
Run → PASS. Then `node test/run.mjs` → verde.

- [ ] **Step 3: Commit**
```bash
git add lib/similar-components.mjs test/lib/similar-components.test.mjs
git commit --no-verify -m "feat(similar): agrupar componentes parecidos (union-find)"
```

---

## Task 3: CLI `bin/similar-components.mjs`

**Files:**
- Create: `bin/similar-components.mjs`

- [ ] **Step 1: Implement** — `bin/similar-components.mjs`:
```js
#!/usr/bin/env node
// CLI: detecta grupos de componentes parecidos en el proyecto e imprime el reporte (JSON) a stdout.
import { resolve, join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadConfig, defaultProjectConfigPath } from '../lib/config.mjs';
import { enumerateFiles } from '../lib/walk.mjs';
import { findSimilarGroups } from '../lib/similar-components.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}

const dir = resolve(arg('dir', process.cwd()));
const threshold = Number(arg('threshold', '0.85'));
const minElements = Number(arg('min-elements', '3'));

let ts = null;
try {
  const req = createRequire(join(dir, 'noop.js'));
  const mod = await import(pathToFileURL(req.resolve('typescript')).href);
  ts = mod.default || mod;
  if (typeof ts.createSourceFile !== 'function') ts = null;
} catch { ts = null; }
if (!ts) {
  console.error('similar-components: typescript no resuelto en el proyecto.');
  process.stdout.write(JSON.stringify({ groups: [] }, null, 2) + '\n');
  process.exit(0);
}

const config = loadConfig({ projectConfigPath: defaultProjectConfigPath(dir) });
const files = enumerateFiles(dir, config).filter((f) => /\.(tsx|jsx)$/.test(f)).map((f) => join(dir, f));
const groups = findSimilarGroups(ts, files, { threshold, minElements });
for (const g of groups) for (const c of g.components) c.file = relative(dir, c.file);
process.stdout.write(JSON.stringify({ groups }, null, 2) + '\n');
```

- [ ] **Step 2: Verificación manual**:
```bash
T=$(mktemp -d); echo '{}' > "$T/package.json"; ln -s "$(pwd)/node_modules" "$T/node_modules"
printf 'export function CardA(p){ return <div><h2>{p.t}</h2><p>{p.b}</p><button>x</button></div>; }\n' > "$T/CardA.tsx"
printf 'export function CardB(p){ return <div><h2>{p.x}</h2><p>{p.y}</p><button>y</button></div>; }\n' > "$T/CardB.tsx"
node bin/similar-components.mjs --dir "$T" --min-elements 2
rm -rf "$T"
```
Expected: JSON con un grupo que tiene `CardA` y `CardB` y una `similarity` alta.

- [ ] **Step 3: Suite + commit**
```bash
node test/run.mjs   # verde
git add bin/similar-components.mjs
git commit --no-verify -m "feat(similar): CLI bin/similar-components.mjs (reporte JSON)"
```

---

## Task 4: Skill + docs + cierre

**Files:**
- Create: `skills/praxis-similar-components/SKILL.md`
- Modify: `AGENTS.md`, `README.md`

- [ ] **Step 1: `skills/praxis-similar-components/SKILL.md`**:
```markdown
---
name: praxis-similar-components
description: Detecta componentes React parecidos/duplicados entre archivos que convendría unificar en un componente compartido. Invocar cuando el usuario dice "buscá componentes para unificar", "qué componentes se repiten", "componentes duplicados/parecidos", o quiere DRY-ear componentes.
---

# praxis-similar-components

Encuentra grupos de componentes con estructura JSX parecida (candidatos a unificar). Motor:
`bin/similar-components.mjs` (determinista). **Solo sugiere** — no refactoriza.

## Proceso
1. Correr `node ${CLAUDE_PLUGIN_ROOT}/bin/similar-components.mjs --dir <raíz>` → leer `{ groups }`.
   (Params opcionales: `--threshold 0.85`, `--min-elements 3`.)
2. Si `groups` está vacío → avisar que no hay componentes parecidos sobre el umbral (y que se puede
   bajar `--threshold`).
3. Por cada grupo: listar `file:name` + la `similarity`; **sugerir** unificarlos en un componente
   compartido — proponer ubicación (`src/shared/` o `components/` según la estructura del repo) y qué
   difiere entre ellos (lo que sería props del compartido). Es una **sugerencia**: el dev decide.
4. NO edites archivos salvo pedido explícito; un refactor real es otro trabajo.

## Reglas
- El reporte es best-effort (estructura JSX + hooks, no semántica). Filtrá los falsos positivos con criterio.
- Subí `--threshold` si hay ruido; bajalo si querés casos más laxos.
```

- [ ] **Step 2: `AGENTS.md`** — agregar bajo "Generación de tests" (o cerca) un párrafo:
```markdown
## Componentes para unificar

La skill **`praxis-similar-components`** detecta componentes React parecidos entre archivos (firma
estructural del JSX + hooks, similitud Jaccard sobre un umbral) y sugiere unificarlos en un componente
compartido. On-demand (motor `bin/similar-components.mjs`); solo señala, no refactoriza.
```

- [ ] **Step 3: `README.md`** — sección corta con el uso del bin/skill.

- [ ] **Step 4: Suite + commit**
```bash
node test/run.mjs   # verde
git add skills/praxis-similar-components/SKILL.md AGENTS.md README.md
git commit --no-verify -m "feat(similar): skill praxis-similar-components + docs"
```

- [ ] **Step 5: Cerrar y mergear**

`todo-plugin:todo-done` para *"Auditar componentes similares → unificar en compartidos"*. Luego
`superpowers:finishing-a-development-branch` para `feat/similar-components`.

---

## Self-review (cobertura del spec)

- **§A fingerprint + similarity** → Task 1. ✅
- **§B agrupado (union-find, entre archivos)** → Task 2. ✅
- **§C CLI (enumera + JSON)** → Task 3. ✅
- **§D skill** → Task 4. ✅
- **§E tests del motor** → Tasks 1-2. ✅
- **§F docs** → Task 4. ✅

Sin placeholders. Firmas consistentes: `extractComponents/fingerprintComponent/similarity` (Task 1) usadas
por `findSimilarGroups` (Task 2) y por el bin (Task 3). El shape del reporte `{ groups: [{ similarity,
components:[{file,name}] }] }` coincide entre Task 2 (return), Task 3 (output) y Task 4 (lo que la skill lee).
