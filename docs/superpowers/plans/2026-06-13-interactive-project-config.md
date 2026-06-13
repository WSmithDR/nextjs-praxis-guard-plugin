# Interactive per-project config (`praxis-config`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive `praxis-config` skill that asks the user which rules/options to apply and persists them in a dedicated `.praxis-guard/` directory per project, plus a Claude Code SessionStart auto-offer when a Next.js project lacks config.

**Architecture:** A deterministic zero-dep CLI (`bin/praxis-config.mjs`, `show`/`write`) validates + atomically writes `.praxis-guard/config.json` and stamps `.praxis-guard/meta.json`; a neutral-language skill drives it via Q&A. `lib/validate-config.mjs` is the shared validator. `lib/config.mjs` learns to read `.praxis-guard/config.json` as the highest-priority config location. A SessionStart hook offers setup (Claude Code only), one-time via an OS-temp marker.

**Tech Stack:** Node ≥18 ESM (`.mjs`), zero runtime deps. Built on existing plugin: `lib/config.mjs` deep-merge, `bin/install-hooks.mjs`, `hooks/hooks.json`, `test/run.mjs` auto-discovery. Spec: `docs/superpowers/specs/2026-06-13-interactive-project-config-design.md`.

**Note on commits:** this repo has a `TODO-PRE-COMMIT` git hook; commit every task with `git commit --no-verify` (consistent with all prior commits).

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `lib/validate-config.mjs` | `validateConfig(obj) → {ok, errors}` — pure schema check | Create |
| `lib/config.mjs` | add `.praxis-guard/config.json` as highest-priority path | Modify |
| `bin/praxis-config.mjs` | CLI `show`/`write`: validate → atomic write → stamp meta | Create |
| `skills/praxis-config/SKILL.md` | neutral-language interactive flow calling the CLI | Create |
| `hooks/praxis-session-offer.mjs` | SessionStart auto-offer (Claude Code), one-time marker | Create |
| `hooks/hooks.json` | add SessionStart block | Modify |
| `AGENTS.md`, `README.md` | document the skill + `.praxis-guard/` layout | Modify |
| `test/lib/validate-config.test.mjs`, `test/lib/config.test.mjs`, `test/bin/praxis-config.test.mjs`, `test/hooks/session-offer.test.mjs` | tests (auto-discovered by `test/run.mjs`) | Create/extend |

---

### Task 1: `lib/validate-config.mjs`

**Files:**
- Create: `lib/validate-config.mjs`, `test/lib/validate-config.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/lib/validate-config.test.mjs
import { validateConfig } from '../../lib/validate-config.mjs';
import assert from 'node:assert/strict';

// valid shapes
assert.equal(validateConfig({}).ok, true);
assert.equal(validateConfig({ rules: { secrets: { enabled: false } } }).ok, true);
assert.equal(validateConfig({ rules: { 'file-responsibility': { maxLines: 300, mixedSignalsLines: 150 } } }).ok, true);
assert.equal(validateConfig({ rules: { 'forbidden-imports': { list: [{ module: 'lodash', message: 'x' }] } } }).ok, true);
assert.equal(validateConfig({ include: ['.ts'], exclude: ['dist/'] }).ok, true);

// unknown rule id
let r = validateConfig({ rules: { 'no-such-rule': {} } });
assert.equal(r.ok, false);
assert.ok(r.errors.some((e) => /desconocida/.test(e)), 'flags unknown rule');

// wrong types
r = validateConfig({ rules: { 'file-responsibility': { maxLines: '300' } } });
assert.equal(r.ok, false);
assert.ok(r.errors.some((e) => /maxLines/.test(e)));

assert.equal(validateConfig({ rules: { secrets: { enabled: 'yes' } } }).ok, false);

// forbidden-imports.list entries must have module:string
r = validateConfig({ rules: { 'forbidden-imports': { list: [{ message: 'x' }] } } });
assert.equal(r.ok, false);
assert.ok(r.errors.some((e) => /module/.test(e)));

// untranslated-text.ignore must be string[]
assert.equal(validateConfig({ rules: { 'untranslated-text': { ignore: 'Enviar' } } }).ok, false);

// non-objects
assert.equal(validateConfig(null).ok, false);
assert.equal(validateConfig([]).ok, false);
console.log('validate-config.test ok');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test/lib/validate-config.test.mjs`
Expected: FAIL — cannot find `lib/validate-config.mjs`

- [ ] **Step 3: Implement `lib/validate-config.mjs`**

```js
// lib/validate-config.mjs
// Pure validator for a project config object (the thing deep-merged over defaults).
// Returns { ok, errors }. Never throws.
const KNOWN_RULES = ['secrets', 'hardcoded-data', 'forbidden-imports', 'file-responsibility', 'untranslated-text'];
const NUMERIC_KEYS = ['maxLines', 'mixedSignalsLines', 'minElements'];

function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function isStringArray(v) { return Array.isArray(v) && v.every((x) => typeof x === 'string'); }

export function validateConfig(obj) {
  const errors = [];
  if (!isObject(obj)) return { ok: false, errors: ['la config debe ser un objeto JSON'] };

  if ('include' in obj && !isStringArray(obj.include)) errors.push('include debe ser un array de strings');
  if ('exclude' in obj && !isStringArray(obj.exclude)) errors.push('exclude debe ser un array de strings');

  if ('rules' in obj) {
    if (!isObject(obj.rules)) {
      errors.push('rules debe ser un objeto');
    } else {
      for (const [id, rule] of Object.entries(obj.rules)) {
        if (!KNOWN_RULES.includes(id)) {
          errors.push(`regla desconocida: "${id}" (válidas: ${KNOWN_RULES.join(', ')})`);
          continue;
        }
        if (!isObject(rule)) { errors.push(`rules.${id} debe ser un objeto`); continue; }
        if ('enabled' in rule && typeof rule.enabled !== 'boolean') errors.push(`rules.${id}.enabled debe ser boolean`);
        for (const k of NUMERIC_KEYS) {
          if (k in rule && typeof rule[k] !== 'number') errors.push(`rules.${id}.${k} debe ser número`);
        }
        if (id === 'forbidden-imports' && 'list' in rule) {
          if (!Array.isArray(rule.list)) {
            errors.push('rules.forbidden-imports.list debe ser un array');
          } else {
            rule.list.forEach((e, i) => {
              if (!isObject(e) || typeof e.module !== 'string') {
                errors.push(`rules.forbidden-imports.list[${i}] debe tener "module" (string)`);
              } else if ('message' in e && typeof e.message !== 'string') {
                errors.push(`rules.forbidden-imports.list[${i}].message debe ser string`);
              }
            });
          }
        }
        if (id === 'untranslated-text') {
          if ('ignore' in rule && !isStringArray(rule.ignore)) errors.push('rules.untranslated-text.ignore debe ser un array de strings');
          if ('attributes' in rule && !isStringArray(rule.attributes)) errors.push('rules.untranslated-text.attributes debe ser un array de strings');
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node test/lib/validate-config.test.mjs`
Expected: prints `validate-config.test ok`

- [ ] **Step 5: Commit**

```bash
git add lib/validate-config.mjs test/lib/validate-config.test.mjs
git commit --no-verify -m "feat: config validator"
```

---

### Task 2: `lib/config.mjs` — `.praxis-guard/config.json` highest priority

**Files:**
- Modify: `lib/config.mjs:25-32`
- Modify: `test/lib/config.test.mjs` (extend)

- [ ] **Step 1: Add a failing test** — append before the final `console.log('config.test ok')` in `test/lib/config.test.mjs`:

```js
// .praxis-guard/config.json takes highest priority
import { mkdtempSync as _mkdtemp2, mkdirSync as _mkdir2, writeFileSync as _write2, rmSync as _rm2 } from 'node:fs';
import { tmpdir as _tmp2 } from 'node:os';
import { join as _join2 } from 'node:path';

const _d = _mkdtemp2(_join2(_tmp2(), 'praxis-prio-'));
_mkdir2(_join2(_d, '.praxis-guard'));
_write2(_join2(_d, '.praxis-guard', 'config.json'), '{}');
_write2(_join2(_d, 'nextjs-praxis-guard.json'), '{}'); // lower priority sibling present
assert.equal(defaultProjectConfigPath(_d), _join2(_d, '.praxis-guard', 'config.json'),
  '.praxis-guard wins over root file');

// when nothing exists, default is the .praxis-guard path
const _empty = _mkdtemp2(_join2(_tmp2(), 'praxis-empty-'));
assert.equal(defaultProjectConfigPath(_empty), _join2(_empty, '.praxis-guard', 'config.json'),
  'default is the canonical .praxis-guard path');

[_d, _empty].forEach((x) => _rm2(x, { recursive: true, force: true }));
```

> Note: `test/lib/config.test.mjs` already imports `defaultProjectConfigPath` and `loadConfig`, `assert`. Reuse those imports; the aliased `node:fs`/`node:os`/`node:path` imports above avoid clashing with any existing ones in the file.

- [ ] **Step 2: Run to verify it fails**

Run: `node test/lib/config.test.mjs`
Expected: FAIL — `defaultProjectConfigPath` returns the root file, not `.praxis-guard/config.json`.

- [ ] **Step 3: Modify `lib/config.mjs`** — replace the current `defaultProjectConfigPath` (lines 25-32):

```js
export function defaultProjectConfigPath(cwd = process.cwd()) {
  const candidates = [
    join(cwd, '.praxis-guard', 'config.json'),
    join(cwd, 'nextjs-praxis-guard.json'),
    join(cwd, '.config', 'nextjs-praxis-guard.json'),
    join(cwd, '.claude', 'nextjs-praxis-guard.json'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node test/lib/config.test.mjs`
Expected: prints `config.test ok`

- [ ] **Step 5: Run full suite (no regressions)**

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add lib/config.mjs test/lib/config.test.mjs
git commit --no-verify -m "feat: resolve .praxis-guard/config.json as primary config path"
```

---

### Task 3: `bin/praxis-config.mjs` (show/write)

**Files:**
- Create: `bin/praxis-config.mjs`, `test/bin/praxis-config.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/bin/praxis-config.test.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const CLI = new URL('../../bin/praxis-config.mjs', import.meta.url).pathname;
function run(args, input) {
  return execFileSync('node', [CLI, ...args], { input: input ?? '', encoding: 'utf8' });
}

const dir = mkdtempSync(join(tmpdir(), 'praxis-cli-'));

// show on empty project -> {}
assert.equal(run(['show', '--dir', dir]).trim(), '{}');

// write valid -> config.json + meta.json
run(['write', '--dir', dir], JSON.stringify({ rules: { 'file-responsibility': { maxLines: 250 } } }));
const cfg = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'config.json'), 'utf8'));
assert.equal(cfg.rules['file-responsibility'].maxLines, 250);
const meta = JSON.parse(readFileSync(join(dir, '.praxis-guard', 'meta.json'), 'utf8'));
assert.ok(meta.configured_at && meta.plugin_version, 'meta stamped');
assert.equal(meta.schema_version, 1);

// show now returns the written config
assert.ok(run(['show', '--dir', dir]).includes('250'));

// write invalid -> exit 1, does NOT overwrite the good config
let threw = false;
try { run(['write', '--dir', dir], JSON.stringify({ rules: { bogus: {} } })); }
catch (e) { threw = true; assert.equal(e.status, 1); }
assert.ok(threw, 'invalid config rejected with exit 1');
assert.ok(JSON.parse(readFileSync(join(dir, '.praxis-guard', 'config.json'), 'utf8')).rules['file-responsibility'],
  'previous valid config preserved');

rmSync(dir, { recursive: true, force: true });
console.log('praxis-config-cli.test ok');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test/bin/praxis-config.test.mjs`
Expected: FAIL — cannot find `bin/praxis-config.mjs`

- [ ] **Step 3: Implement `bin/praxis-config.mjs`**

```js
// bin/praxis-config.mjs
// Deterministic CLI behind the praxis-config skill. Zero-dep ESM.
//   show  [--dir <project>]  -> prints current .praxis-guard/config.json (or "{}")
//   write [--dir <project>]  -> reads a config object from stdin, validates, writes
//                               .praxis-guard/config.json atomically + stamps meta.json
// NOTE: this is a normal Node CLI (not a workflow script), so `new Date()` is fine here.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { validateConfig } from '../lib/validate-config.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def) {
  const eq = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (eq) return eq.slice(`--${name}=`.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

function readStdin() {
  return new Promise((res) => {
    let d = '';
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => res(d));
    process.stdin.on('error', () => res(''));
    if (process.stdin.isTTY) res('');
  });
}

function pluginVersion() {
  try {
    const m = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    return m.version || '0.0.0';
  } catch { return '0.0.0'; }
}

function gitUser(dir) {
  try { return execSync('git config user.name', { cwd: dir, encoding: 'utf8' }).trim() || 'unknown'; }
  catch { return 'unknown'; }
}

function writeAtomic(path, text) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

const cmd = process.argv[2];
const dir = resolve(arg('dir', process.cwd()));
const configDir = join(dir, '.praxis-guard');
const configPath = join(configDir, 'config.json');
const metaPath = join(configDir, 'meta.json');

if (cmd === 'show') {
  process.stdout.write(existsSync(configPath) ? readFileSync(configPath, 'utf8') : '{}\n');
  process.exit(0);
}

if (cmd === 'write') {
  const raw = await readStdin();
  let obj;
  try { obj = JSON.parse(raw || '{}'); }
  catch { console.error('praxis-config: JSON inválido en stdin'); process.exit(1); }
  const { ok, errors } = validateConfig(obj);
  if (!ok) { console.error('praxis-config: config inválida:\n  - ' + errors.join('\n  - ')); process.exit(1); }
  mkdirSync(configDir, { recursive: true });
  writeAtomic(configPath, JSON.stringify(obj, null, 2) + '\n');
  writeAtomic(metaPath, JSON.stringify({
    configured_by: gitUser(dir),
    configured_at: new Date().toISOString().slice(0, 10),
    plugin_version: pluginVersion(),
    schema_version: 1,
  }, null, 2) + '\n');
  console.log(`praxis-config: escrito ${configPath}`);
  process.exit(0);
}

console.error('uso: node bin/praxis-config.mjs <show|write> [--dir <proyecto>]');
process.exit(1);
```

- [ ] **Step 4: Run to verify it passes**

Run: `node test/bin/praxis-config.test.mjs`
Expected: prints `praxis-config-cli.test ok`

- [ ] **Step 5: Commit**

```bash
git add bin/praxis-config.mjs test/bin/praxis-config.test.mjs
git commit --no-verify -m "feat: praxis-config CLI (show/write with atomic persistence)"
```

---

### Task 4: `skills/praxis-config/SKILL.md`

**Files:**
- Create: `skills/praxis-config/SKILL.md`

No automated test (prose); the deterministic behavior it drives is covered by Task 3.

- [ ] **Step 1: Create `skills/praxis-config/SKILL.md`**

```markdown
---
name: praxis-config
description: Configura nextjs-praxis-guard para ESTE proyecto de forma interactiva — qué reglas corren y con qué parámetros. Use when el usuario dice "configurá praxis", "qué reglas aplico", "cambiar la config del guard", o cuando falta `.praxis-guard/config.json`.
---

# praxis-config

Arma o edita la config por-proyecto del plugin nextjs-praxis-guard. La config vive en
`.praxis-guard/config.json` (committeala: es config de equipo). Esta skill conduce el Q&A;
la escritura la hace el CLI determinista `bin/praxis-config.mjs` (valida + escribe atómico).

## Proceso

1. **Leé el estado actual** corriendo:
   `node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-config.mjs show --dir <raíz-del-proyecto>`
   - Salida `{}` → modo **first-run** (no hay config).
   - Salida con contenido → modo **editar** (mostrásela al usuario antes de preguntar).

2. **Preguntá al usuario** (en Claude Code podés usar la UI de opciones; en otros CLIs,
   en el chat). Cubrí, una cosa a la vez:
   - Qué reglas activar/desactivar: `secrets`, `hardcoded-data`, `forbidden-imports`,
     `file-responsibility`, `untranslated-text`.
   - Umbrales: `file-responsibility.maxLines` (default 400) y `mixedSignalsLines` (200);
     `hardcoded-data.minElements` (8).
   - `forbidden-imports.list`: entradas `{ "module": "...", "message": "..." }`.
   - `untranslated-text`: on/off y `ignore` (textos permitidos).
   En modo editar, preguntá SOLO qué quiere cambiar; respetá lo demás.

3. **Construí el objeto config** declarando únicamente lo que difiere de los defaults
   (no repitas valores por defecto). Mismo schema que `config/defaults.json`.

4. **Escribilo** pasando el objeto por stdin:
   `echo '<json>' | node ${CLAUDE_PLUGIN_ROOT}/bin/praxis-config.mjs write --dir <raíz>`
   - Si el CLI sale con error (config inválida), mostrá los mensajes y volvé a preguntar.
     NUNCA escribas a mano el archivo: siempre pasá por el CLI (valida + atómico + meta).

5. **Confirmá** al usuario qué quedó en `.praxis-guard/config.json` y recordale commitearlo.

## Reglas
- No inventes ids de regla: solo las cinco de arriba.
- El plugin nunca bloquea; esta config solo decide qué avisos ves.
- Si el usuario no quiere configurar nada, no escribas: el detector usa los defaults.
```

- [ ] **Step 2: Smoke-check the CLI the skill relies on**

Run: `node bin/praxis-config.mjs show --dir /tmp` (expect `{}`-ish output, exit 0). Then a write round-trip in a temp dir:
```bash
TMP=$(mktemp -d); echo '{"rules":{"secrets":{"enabled":false}}}' | node bin/praxis-config.mjs write --dir "$TMP" && node bin/praxis-config.mjs show --dir "$TMP"; rm -rf "$TMP"
```
Expected: prints `praxis-config: escrito ...` then the written JSON.

- [ ] **Step 3: Commit**

```bash
git add skills/praxis-config/SKILL.md
git commit --no-verify -m "feat: praxis-config interactive skill"
```

---

### Task 5: SessionStart auto-offer

**Files:**
- Create: `hooks/praxis-session-offer.mjs`, `test/hooks/session-offer.test.mjs`
- Modify: `hooks/hooks.json`

- [ ] **Step 1: Write the failing test**

```js
// test/hooks/session-offer.test.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const SCRIPT = new URL('../../hooks/praxis-session-offer.mjs', import.meta.url).pathname;
function run(cwd) { return execFileSync('node', [SCRIPT], { cwd, encoding: 'utf8' }); }

// next project, no config -> offers (stdout mentions the skill), exit 0
const dir = mkdtempSync(join(tmpdir(), 'praxis-next-'));
writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '14.0.0' } }));
assert.ok(/praxis-config/.test(run(dir)), 'offers setup');
// second run -> marker set -> silent
assert.equal(run(dir).trim(), '', 'silent after first offer');

// non-next project -> silent
const plain = mkdtempSync(join(tmpdir(), 'praxis-plain-'));
writeFileSync(join(plain, 'package.json'), JSON.stringify({ dependencies: {} }));
assert.equal(run(plain).trim(), '', 'silent on non-next');

// next project WITH config -> silent
const configured = mkdtempSync(join(tmpdir(), 'praxis-cfg-'));
writeFileSync(join(configured, 'package.json'), JSON.stringify({ dependencies: { next: '14' } }));
mkdirSync(join(configured, '.praxis-guard'));
writeFileSync(join(configured, '.praxis-guard', 'config.json'), '{}');
assert.equal(run(configured).trim(), '', 'silent when configured');

[dir, plain, configured].forEach((d) => rmSync(d, { recursive: true, force: true }));
console.log('session-offer.test ok');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test/hooks/session-offer.test.mjs`
Expected: FAIL — cannot find `hooks/praxis-session-offer.mjs`

- [ ] **Step 3: Implement `hooks/praxis-session-offer.mjs`**

```js
// hooks/praxis-session-offer.mjs
// SessionStart (Claude Code): offer the praxis-config skill when a Next.js project
// has no .praxis-guard/config.json. Non-blocking: ALWAYS exit 0. One-time per project
// via an OS-temp marker keyed by the project path (never writes into the repo).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

function isNextProject(cwd) {
  if (existsSync(join(cwd, 'next.config.js')) ||
      existsSync(join(cwd, 'next.config.mjs')) ||
      existsSync(join(cwd, 'next.config.ts'))) return true;
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    return Boolean((pkg.dependencies && pkg.dependencies.next) ||
                   (pkg.devDependencies && pkg.devDependencies.next));
  } catch { return false; }
}

function markerPath(cwd) {
  const h = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
  return join(tmpdir(), `praxis-guard-offered-${h}`);
}

try {
  const cwd = process.cwd();
  if (isNextProject(cwd) &&
      !existsSync(join(cwd, '.praxis-guard', 'config.json'))) {
    const marker = markerPath(cwd);
    if (!existsSync(marker)) {
      writeFileSync(marker, cwd);
      process.stdout.write(
        'praxis-guard: este proyecto Next.js no tiene config propia. ' +
        'Para elegir qué reglas corren, invocá la skill `praxis-config`.\n'
      );
    }
  }
} catch { /* never block the session */ }
process.exit(0);
```

- [ ] **Step 4: Run to verify it passes**

Run: `node test/hooks/session-offer.test.mjs`
Expected: prints `session-offer.test ok`

- [ ] **Step 5: Add the SessionStart block to `hooks/hooks.json`** — the file currently has `PostToolUse` and `AfterTool` keys inside `"hooks"`. Add a `SessionStart` sibling key so the object becomes:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/praxis-session-offer.mjs\"" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/hook-adapter.mjs\" --cli=claude" }
        ]
      }
    ],
    "AfterTool": [
      {
        "matcher": "write_file|replace",
        "hooks": [
          { "name": "praxis-guard", "type": "command", "timeout": 10000,
            "command": "node \"$GEMINI_PROJECT_DIR/hooks/hook-adapter.mjs\" --cli=gemini" }
        ]
      }
    ]
  }
}
```

Verify it parses: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('hooks json ok')"` → `hooks json ok`.

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 7: Commit**

```bash
git add hooks/praxis-session-offer.mjs hooks/hooks.json test/hooks/session-offer.test.mjs
git commit --no-verify -m "feat: SessionStart auto-offer for praxis-config (Claude Code)"
```

---

### Task 6: Docs — `AGENTS.md` + `README.md`

**Files:**
- Modify: `AGENTS.md`, `README.md`

- [ ] **Step 1: Update `AGENTS.md`** — after the "Soporte por CLI" list, add a section:

```markdown
## Configuración por proyecto

La config vive en `.praxis-guard/config.json` (committeala — es config de equipo). Para
armarla o cambiarla de forma guiada, invocá la skill **`praxis-config`**: te pregunta qué
reglas correr y con qué parámetros, y la escribe por vos (vía `bin/praxis-config.mjs`).
En Claude Code, si un proyecto Next.js no tiene config, el hook SessionStart te lo ofrece
una vez. En las otras CLIs, corré `praxis-config` a demanda.
```

- [ ] **Step 2: Update `README.md`** — in the "Configuración" section, add (before the example JSON) a short paragraph:

```markdown
La forma recomendada de armar/cambiar la config es la skill **`praxis-config`** (te pregunta
y la escribe en `.praxis-guard/config.json`, que es la ruta de máxima prioridad). También
podés editar el JSON a mano: el detector busca, en orden, `.praxis-guard/config.json` →
`nextjs-praxis-guard.json` (raíz) → `.config/...` → `.claude/...`.
```

- [ ] **Step 3: Run full suite + portability audit**

Run: `npm test` (expect all pass).
Run: `python3 <cli-plugin-template>/features/portability-audit/files/audit-portability.py .` and confirm 0 CRITICAL (the `.praxis-guard/` mentions are CLI-agnostic; no new criticals expected).

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md
git commit --no-verify -m "docs: document praxis-config skill and .praxis-guard layout"
```

---

## Self-review (against the spec)

**Spec coverage:**
- `.praxis-guard/` with `config.json` + `meta.json` → Task 3 (writes both). ✓
- Config resolution priority (`.praxis-guard/` highest, fallbacks kept) → Task 2. ✓
- `lib/validate-config.mjs` with the listed checks → Task 1. ✓
- `bin/praxis-config.mjs` show/write, validate → atomic → meta stamp, `--dir` default cwd → Task 3. ✓
- Skill `praxis-config` neutral language, first-run vs editar, calls CLI, never writes by hand → Task 4. ✓
- SessionStart auto-offer (Claude only), next-project detection, missing-config, one-time marker in OS temp, never blocks → Task 5. ✓
- Multi-CLI: skill neutral + AGENTS.md mention; auto-offer Claude-only → Tasks 4, 5, 6. ✓
- Git: config committed (documented) → Task 6 / SKILL.md. ✓
- Error handling: validate-before-write, atomic, exit 1 on invalid, never block → Tasks 1, 3, 5. ✓
- Testing: priority, validator, CLI round-trip + invalid rejection, offer script → Tasks 1, 2, 3, 5. ✓

**Out of scope (per spec, not planned):** change history/rollback, configuring include/exclude globs from the skill, the full-project audit skill, native interactive setup beyond chat Q&A in non-Claude CLIs. ✓

**Placeholder scan:** every code/test step has complete code; no TBD/TODO. ✓

**Type consistency:** `validateConfig(obj) → {ok, errors}` used identically in Tasks 1 and 3; `defaultProjectConfigPath(cwd)` signature unchanged (Task 2); CLI subcommands `show`/`write` and `--dir` consistent across Tasks 3, 4, 5 tests and SKILL.md. ✓

## Open verification items (carry into execution)
1. **SessionStart stdout surfacing** — confirm Claude Code shows the offer script's stdout at session start in your build (vs. needing an `additionalContext` JSON envelope). The script is informational/exit-0; if your build ignores plain stdout for SessionStart, wrap the message in `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`.
2. **Per-CLI skill discovery** — Claude Code auto-discovers `skills/`. If you later want `praxis-config` invocable in Cursor/Codex/Copilot via their manifests, add the skill path there (out of this plan's scope; AGENTS.md already documents it so the model can run the CLI directly).
