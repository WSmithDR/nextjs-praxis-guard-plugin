# nextjs-praxis-guard — MVP Implementation Plan (multi-CLI real)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A multi-CLI plugin whose detection engine lints each file an AI agent writes/edits in a Next.js project and injects non-blocking praxis warnings back into the agent's context — wired into the native post-edit hook of Claude Code, Gemini CLI, Codex CLI, Copilot CLI, and OpenCode.

**Architecture:** A CLI-agnostic core (`detect.mjs` + `rules/*.mjs` + `lib/`) takes a file path and returns `Finding[]`, runnable standalone as `node hooks/detect.mjs <file>`. A single parameterized `hooks/hook-adapter.mjs` bridges the 4 command-type hooks (Claude/Gemini/Codex/Copilot): it reads the CLI's JSON on stdin, extracts the edited path, runs the core, and emits the CLI's `additionalContext` JSON envelope on stdout. OpenCode gets a thin JS plugin that calls the same core. The detector **never blocks** (warn-only) and **never breaks an edit** (always exit 0).

**Tech Stack:** Node ≥18 ESM (`.mjs`), zero runtime dependencies. Built on `cli-plugin-template` features: `claude-code-hooks` (exit-code convention, `CLAUDE_PLUGIN_ROOT` gotcha), `externalized-config` (`config/defaults.json`), `multi-cli-compat` (per-CLI manifests, AGENTS.md/GEMINI.md, omit `model:`), `bundled-scripts` (deterministic detector), `portability-audit` (pre-ship hygiene).

**Source design:** `docs/specs/2026-06-12-mvp-praxis-hooks-design.md`. Per-CLI hook research is summarized in each Phase-2 task.

---

## Conventions used by every rule

```
Rule signature:  (fileContent: string, filePath: string, config: object) => Finding[]

Finding = {
  rule: string                 // rule id, e.g. "secrets"
  line?: number                // 1-based approximate line
  message: string              // what was found + how to fix
  severity: 'info' | 'warn'    // v1 never blocks; no 'error'
}
```

- Rules are pure: no disk/network, content passed in. Testable in isolation.
- A rule that throws is caught by the orchestrator and dropped (never breaks detection).
- `config` is the merged config object (see Task 3).

## Target file structure

```
nextjs-praxis-guard-plugin/
  package.json                       # type:module, scripts: test, detect
  .gitignore
  .portabilityignore
  .claude-plugin/plugin.json         # Claude Code manifest
  .copilot-plugin/plugin.json        # Copilot manifest
  .codex-plugin/plugin.json          # Codex manifest
  gemini-extension.json              # Gemini manifest (contextFileName: GEMINI.md)
  opencode.json                      # OpenCode manifest
  AGENTS.md                          # shared instructions (Copilot/Codex/OpenCode read this)
  CLAUDE.md -> AGENTS.md             # symlink (Claude Code)
  GEMINI.md                          # Gemini context (@-includes AGENTS.md)
  hooks/
    hooks.json                       # Claude Code PostToolUse -> hook-adapter (claude)
    detect.mjs                       # CORE: runDetector(filePath,{config,content}) + CLI entry
    hook-adapter.mjs                 # shared stdin/stdout bridge, --cli=claude|gemini|codex|copilot
  rules/
    index.mjs                        # registry { id -> rule fn }
    secrets.mjs
    hardcoded-data.mjs
    forbidden-imports.mjs
    file-responsibility.mjs
  lib/
    config.mjs                       # load defaults + project override (deep merge)
    findings.mjs                     # formatFindings(findings, filePath) -> string
    scope.mjs                        # isInScope(filePath, config) -> bool
  config/
    defaults.json                    # sensible Next.js defaults
  cli/
    copilot-hooks.json               # to drop in target .github/hooks/ (Copilot)
    codex-hooks.json                 # to drop in target .codex/ (Codex, non-bundled path)
    opencode-plugin.mjs              # to drop in target .opencode/plugins/ (OpenCode)
  bin/
    install-hooks.mjs                # wires Copilot/OpenCode into a target project
  test/
    fixtures/<rule>/{good,bad}/...   # passing & failing samples per rule
    run.mjs                          # runner: asserts findings on bad, silence on good
  README.md
```

---

## Phase 0 — Scaffold & base structure

### Task 1: Repo skeleton, package.json, Claude manifest

**Files:**
- Create: `package.json`, `.gitignore`, `.claude-plugin/plugin.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "nextjs-praxis-guard-plugin",
  "version": "0.1.0",
  "description": "Multi-CLI guard that warns on Next.js bad-praxis in files an AI agent writes.",
  "type": "module",
  "private": true,
  "engines": { "node": ">=18" },
  "scripts": {
    "test": "node test/run.mjs",
    "detect": "node hooks/detect.mjs"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.DS_Store
*.log
.claude/settings.local.json
```

- [ ] **Step 3: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "nextjs-praxis-guard",
  "version": "0.1.0",
  "description": "Avisa (sin bloquear) sobre malas praxis en Next.js: secretos, datos quemados, imports prohibidos y archivos que mezclan responsabilidades.",
  "author": "SmithDR"
}
```

- [ ] **Step 4: Verify Node runs ESM**

Run: `node --input-type=module -e "console.log('esm-ok')"`
Expected: prints `esm-ok`

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore .claude-plugin/plugin.json
git commit -m "chore: scaffold plugin skeleton and Claude manifest"
```

---

## Phase 1 — Core engine (CLI-agnostic, TDD)

### Task 2: `Finding` formatting — `lib/findings.mjs`

**Files:**
- Create: `lib/findings.mjs`, `test/lib/findings.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/lib/findings.test.mjs
import { formatFindings } from '../../lib/findings.mjs';
import assert from 'node:assert/strict';

const findings = [
  { rule: 'secrets', line: 12, message: 'API key hardcodeada.', severity: 'warn' },
  { rule: 'file-responsibility', message: '437 líneas (umbral 400).', severity: 'info' },
];

const out = formatFindings(findings, 'app/page.tsx');
assert.ok(out.includes('praxis-guard'), 'has banner');
assert.ok(out.includes('app/page.tsx'), 'has file path');
assert.ok(out.includes('secrets:12'), 'rule + line');
assert.ok(out.includes('[warn]') && out.includes('[info]'), 'severities');

assert.equal(formatFindings([], 'x.tsx'), '', 'empty findings -> empty string');
console.log('findings.test ok');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test/lib/findings.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/findings.mjs'`

- [ ] **Step 3: Implement `lib/findings.mjs`**

```js
// lib/findings.mjs
// Formats Finding[] into a concise, agent-readable block. Empty -> "".
export function formatFindings(findings, filePath) {
  if (!Array.isArray(findings) || findings.length === 0) return '';
  const lines = findings.map((f) => {
    const loc = f.line ? `${f.rule}:${f.line}` : f.rule;
    return `  [${f.severity}] ${loc} — ${f.message}`;
  });
  return `⚠️ praxis-guard — ${filePath}\n${lines.join('\n')}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node test/lib/findings.test.mjs`
Expected: prints `findings.test ok`

- [ ] **Step 5: Commit**

```bash
git add lib/findings.mjs test/lib/findings.test.mjs
git commit -m "feat: finding formatter"
```

---

### Task 3: Config loading — `config/defaults.json` + `lib/config.mjs`

**Files:**
- Create: `config/defaults.json`, `lib/config.mjs`, `test/lib/config.test.mjs`

- [ ] **Step 1: Create `config/defaults.json`**

```json
{
  "include": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  "exclude": ["node_modules/", ".next/", "dist/", "build/", ".git/", "coverage/"],
  "rules": {
    "secrets": { "enabled": true },
    "hardcoded-data": { "enabled": true, "minElements": 8 },
    "forbidden-imports": { "enabled": true, "list": [] },
    "file-responsibility": { "enabled": true, "maxLines": 400, "mixedSignalsLines": 200 }
  }
}
```

- [ ] **Step 2: Write the failing test**

```js
// test/lib/config.test.mjs
import { loadConfig } from '../../lib/config.mjs';
import assert from 'node:assert/strict';

// defaults only (no project override path)
const def = loadConfig({ projectConfigPath: '/no/such/file.json' });
assert.equal(def.rules['file-responsibility'].maxLines, 400);
assert.equal(def.rules.secrets.enabled, true);
assert.deepEqual(def.rules['forbidden-imports'].list, []);

// project override deep-merges (only overrides given keys)
const merged = loadConfig({
  projectConfigPath: '/no/such/file.json',
  override: { rules: { 'file-responsibility': { maxLines: 250 } } },
});
assert.equal(merged.rules['file-responsibility'].maxLines, 250);
assert.equal(merged.rules['file-responsibility'].mixedSignalsLines, 200, 'untouched key kept');
assert.equal(merged.rules.secrets.enabled, true, 'other rules kept');
console.log('config.test ok');
```

- [ ] **Step 3: Run to verify it fails**

Run: `node test/lib/config.test.mjs`
Expected: FAIL — cannot find `lib/config.mjs`

- [ ] **Step 4: Implement `lib/config.mjs`**

```js
// lib/config.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULTS_PATH = join(__dirname, '..', 'config', 'defaults.json');

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}
function deepMerge(base, over) {
  if (!isObject(over)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}
function readJsonSafe(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

// Default project config path resolver (per-project override file).
export function defaultProjectConfigPath(cwd = process.cwd()) {
  return join(cwd, '.claude', 'nextjs-praxis-guard.json');
}

// loadConfig({ projectConfigPath?, override? }) -> merged config.
// Precedence: defaults < project file < explicit override.
export function loadConfig({ projectConfigPath, override } = {}) {
  const defaults = readJsonSafe(DEFAULTS_PATH);
  if (!defaults) throw new Error('praxis-guard: defaults.json missing/invalid');
  let cfg = defaults;
  if (projectConfigPath) {
    const fromFile = readJsonSafe(projectConfigPath);
    if (fromFile) cfg = deepMerge(cfg, fromFile);
  }
  if (override) cfg = deepMerge(cfg, override);
  return cfg;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node test/lib/config.test.mjs`
Expected: prints `config.test ok`

- [ ] **Step 6: Commit**

```bash
git add config/defaults.json lib/config.mjs test/lib/config.test.mjs
git commit -m "feat: externalized config with deep-merge override"
```

---

### Task 4: Scope filter — `lib/scope.mjs`

**Files:**
- Create: `lib/scope.mjs`, `test/lib/scope.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/lib/scope.test.mjs
import { isInScope } from '../../lib/scope.mjs';
import { loadConfig } from '../../lib/config.mjs';
import assert from 'node:assert/strict';

const cfg = loadConfig({ projectConfigPath: '/no/such.json' });
assert.equal(isInScope('app/page.tsx', cfg), true);
assert.equal(isInScope('lib/util.ts', cfg), true);
assert.equal(isInScope('README.md', cfg), false, 'non-code excluded');
assert.equal(isInScope('node_modules/x/index.js', cfg), false, 'excluded dir');
assert.equal(isInScope('/abs/project/.next/server/page.js', cfg), false, 'excluded dir abs');
console.log('scope.test ok');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test/lib/scope.test.mjs`
Expected: FAIL — cannot find `lib/scope.mjs`

- [ ] **Step 3: Implement `lib/scope.mjs`**

```js
// lib/scope.mjs
export function isInScope(filePath, config) {
  if (!filePath || typeof filePath !== 'string') return false;
  const norm = filePath.replace(/\\/g, '/');
  const exclude = config.exclude || [];
  if (exclude.some((dir) => norm.includes(dir))) return false;
  const include = config.include || [];
  return include.some((ext) => norm.endsWith(ext));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node test/lib/scope.test.mjs`
Expected: prints `scope.test ok`

- [ ] **Step 5: Commit**

```bash
git add lib/scope.mjs test/lib/scope.test.mjs
git commit -m "feat: file scope filter"
```

---

### Task 5: Rule `secrets`

Detect hardcoded API keys / tokens / connection strings. Skip env reads and obvious placeholders.

**Files:**
- Create: `rules/secrets.mjs`, `test/fixtures/secrets/bad/keys.ts`, `test/fixtures/secrets/good/env.ts`, `test/rules/secrets.test.mjs`

- [ ] **Step 1: Create fixtures**

`test/fixtures/secrets/bad/keys.ts`:
```ts
const stripe = "sk_live_51H8aQwEXAMPLEabcdef0123456789ABCDEF";
const aws = "AKIAIOSFODNN7EXAMPLE";
const conn = "postgres://admin:s3cr3tpass@db.example.com:5432/app";
const gh = "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";
```

`test/fixtures/secrets/good/env.ts`:
```ts
const stripe = process.env.STRIPE_SECRET_KEY;
const conn = process.env.DATABASE_URL;
const placeholder = "your-api-key-here";
const short = "ok";
```

- [ ] **Step 2: Write the failing test**

```js
// test/rules/secrets.test.mjs
import { readFileSync } from 'node:fs';
import secrets from '../../rules/secrets.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };
const bad = readFileSync(new URL('../fixtures/secrets/bad/keys.ts', import.meta.url), 'utf8');
const good = readFileSync(new URL('../fixtures/secrets/good/env.ts', import.meta.url), 'utf8');

const badFindings = secrets(bad, 'keys.ts', cfg);
assert.ok(badFindings.length >= 4, `expected >=4 findings, got ${badFindings.length}`);
assert.ok(badFindings.every((f) => f.rule === 'secrets' && f.severity === 'warn'));
assert.ok(badFindings.some((f) => f.line === 1), 'reports line numbers');

const goodFindings = secrets(good, 'env.ts', cfg);
assert.equal(goodFindings.length, 0, `expected 0 on good, got ${JSON.stringify(goodFindings)}`);
console.log('secrets.test ok');
```

- [ ] **Step 3: Run to verify it fails**

Run: `node test/rules/secrets.test.mjs`
Expected: FAIL — cannot find `rules/secrets.mjs`

- [ ] **Step 4: Implement `rules/secrets.mjs`**

```js
// rules/secrets.mjs
// Deterministic secret detector. Warn-only. Conservative to limit false positives.
const PROVIDER_PATTERNS = [
  { re: /\bsk_live_[A-Za-z0-9]{16,}/, label: 'Stripe live secret key' },
  { re: /\bsk-[A-Za-z0-9]{20,}/, label: 'OpenAI-style secret key' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS access key id' },
  { re: /\bghp_[A-Za-z0-9]{36}\b/, label: 'GitHub personal access token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{22,}/, label: 'GitHub fine-grained PAT' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, label: 'Slack token' },
  { re: /\bAIza[0-9A-Za-z_\-]{35}\b/, label: 'Google API key' },
  { re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s:'"]+:[^\s@'"]+@/, label: 'connection string with inline credentials' },
];

// Generic: `secret-ish name = "long literal"` not sourced from env / not a placeholder.
const GENERIC = /(?:api[_-]?key|secret|token|password|passwd|access[_-]?key)\s*[:=]\s*['"`]([^'"`]{16,})['"`]/i;
const PLACEHOLDER = /(your[-_ ]?|example|placeholder|changeme|xxx+|<[^>]+>|dummy|test[-_ ]?key)/i;

export default function secrets(content, _filePath, config = {}) {
  if (config.enabled === false) return [];
  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/process\.env\./.test(line)) continue; // env read -> fine
    for (const { re, label } of PROVIDER_PATTERNS) {
      if (re.test(line)) {
        out.push({ rule: 'secrets', line: i + 1, severity: 'warn',
          message: `Posible ${label} hardcodeado. Movelo a una env var (process.env.X) y a .env.local.` });
        break; // one finding per line max
      }
    }
    if (out.length && out[out.length - 1].line === i + 1) continue;
    const g = GENERIC.exec(line);
    if (g && !PLACEHOLDER.test(g[1])) {
      out.push({ rule: 'secrets', line: i + 1, severity: 'warn',
        message: `Literal sensible asignado en código. Si es un secreto, usá process.env.X en vez de hardcodearlo.` });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node test/rules/secrets.test.mjs`
Expected: prints `secrets.test ok`

- [ ] **Step 6: Commit**

```bash
git add rules/secrets.mjs test/fixtures/secrets test/rules/secrets.test.mjs
git commit -m "feat: secrets rule"
```

---

### Task 6: Rule `hardcoded-data`

Large literal arrays of domain strings inside `.tsx`/`.jsx`. Heuristic: an array literal with ≥ `minElements` string entries.

**Files:**
- Create: `rules/hardcoded-data.mjs`, `test/fixtures/hardcoded-data/bad/list.tsx`, `test/fixtures/hardcoded-data/good/small.tsx`, `test/rules/hardcoded-data.test.mjs`

- [ ] **Step 1: Create fixtures**

`test/fixtures/hardcoded-data/bad/list.tsx`:
```tsx
export const MARCAS = ["Nike","Adidas","Puma","Reebok","Fila","Asics","Vans","Converse","NewBalance"];
export default function Page() { return <ul>{MARCAS.map(m => <li key={m}>{m}</li>)}</ul>; }
```

`test/fixtures/hardcoded-data/good/small.tsx`:
```tsx
const TABS = ["home", "profile"];
export default function Page() { return <div>{TABS[0]}</div>; }
```

- [ ] **Step 2: Write the failing test**

```js
// test/rules/hardcoded-data.test.mjs
import { readFileSync } from 'node:fs';
import rule from '../../rules/hardcoded-data.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, minElements: 8 };
const bad = readFileSync(new URL('../fixtures/hardcoded-data/bad/list.tsx', import.meta.url), 'utf8');
const good = readFileSync(new URL('../fixtures/hardcoded-data/good/small.tsx', import.meta.url), 'utf8');

const badF = rule(bad, 'list.tsx', cfg);
assert.equal(badF.length, 1, `expected 1, got ${badF.length}`);
assert.equal(badF[0].rule, 'hardcoded-data');
assert.equal(badF[0].line, 1);

assert.equal(rule(good, 'small.tsx', cfg).length, 0, 'small array is fine');
// Only .tsx/.jsx are in scope for this rule:
assert.equal(rule(bad, 'data.ts', cfg).length, 0, 'non-component file ignored');
console.log('hardcoded-data.test ok');
```

- [ ] **Step 3: Run to verify it fails**

Run: `node test/rules/hardcoded-data.test.mjs`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement `rules/hardcoded-data.mjs`**

```js
// rules/hardcoded-data.mjs
// Flags large string-literal arrays embedded in React component files (.tsx/.jsx).
// Heuristic, deterministic: count quoted string elements inside each [ ... ] literal.
const STRING_ELEM = /(['"`])(?:\\.|(?!\1).)*\1/g;

export default function hardcodedData(content, filePath, config = {}) {
  if (config.enabled === false) return [];
  if (!/\.(tsx|jsx)$/.test(filePath)) return [];
  const min = config.minElements ?? 8;
  const out = [];
  // Find bracketed array literals; measure how many string elements each holds.
  const arrayRe = /\[([^\[\]]*)\]/g;
  let m;
  while ((m = arrayRe.exec(content)) !== null) {
    const inner = m[1];
    const strings = inner.match(STRING_ELEM);
    if (strings && strings.length >= min) {
      const line = content.slice(0, m.index).split('\n').length;
      out.push({ rule: 'hardcoded-data', line, severity: 'warn',
        message: `Array literal de ${strings.length} strings de dominio en un componente. Extraé a config/, una constante en /lib o la DB.` });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node test/rules/hardcoded-data.test.mjs`
Expected: prints `hardcoded-data.test ok`

- [ ] **Step 6: Commit**

```bash
git add rules/hardcoded-data.mjs test/fixtures/hardcoded-data test/rules/hardcoded-data.test.mjs
git commit -m "feat: hardcoded-data rule"
```

---

### Task 7: Rule `forbidden-imports`

Configurable, empty by default. Each entry: `{ "module": "<exact-or-substring>", "message": "..." }`.

**Files:**
- Create: `rules/forbidden-imports.mjs`, `test/fixtures/forbidden-imports/bad/uses.ts`, `test/fixtures/forbidden-imports/good/ok.ts`, `test/rules/forbidden-imports.test.mjs`

- [ ] **Step 1: Create fixtures**

`test/fixtures/forbidden-imports/bad/uses.ts`:
```ts
import { motion } from "framer-motion";
import { createClient } from "@supabase/supabase-js";
export const x = motion;
```

`test/fixtures/forbidden-imports/good/ok.ts`:
```ts
import { Motion } from "@/lib/motion";
import { supabase } from "@/lib/supabase";
export const x = Motion;
```

- [ ] **Step 2: Write the failing test**

```js
// test/rules/forbidden-imports.test.mjs
import { readFileSync } from 'node:fs';
import rule from '../../rules/forbidden-imports.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, list: [
  { module: 'framer-motion', message: 'Usá tu wrapper @/lib/motion.' },
  { module: '@supabase/supabase-js', message: 'Importá el singleton @/lib/supabase.' },
]};

const bad = readFileSync(new URL('../fixtures/forbidden-imports/bad/uses.ts', import.meta.url), 'utf8');
const good = readFileSync(new URL('../fixtures/forbidden-imports/good/ok.ts', import.meta.url), 'utf8');

const badF = rule(bad, 'uses.ts', cfg);
assert.equal(badF.length, 2, `expected 2, got ${badF.length}`);
assert.ok(badF[0].message.includes('wrapper'));
assert.equal(rule(good, 'ok.ts', cfg).length, 0);
// empty list (default) => never fires:
assert.equal(rule(bad, 'uses.ts', { enabled: true, list: [] }).length, 0);
console.log('forbidden-imports.test ok');
```

- [ ] **Step 3: Run to verify it fails**

Run: `node test/rules/forbidden-imports.test.mjs`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement `rules/forbidden-imports.mjs`**

```js
// rules/forbidden-imports.mjs
// Configurable import blocklist. Empty by default -> never fires.
const IMPORT_RE = /^\s*(?:import\b[^'"]*|export\b[^'"]*from\s*|.*\brequire\s*\()\s*['"]([^'"]+)['"]/;

export default function forbiddenImports(content, _filePath, config = {}) {
  if (config.enabled === false) return [];
  const list = config.list || [];
  if (list.length === 0) return [];
  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = IMPORT_RE.exec(lines[i]);
    if (!m) continue;
    const source = m[1];
    for (const entry of list) {
      if (!entry || !entry.module) continue;
      if (source === entry.module || source.includes(entry.module)) {
        out.push({ rule: 'forbidden-imports', line: i + 1, severity: 'warn',
          message: `Import prohibido "${source}": ${entry.message || 'usá la alternativa del proyecto.'}` });
        break;
      }
    }
  }
  return out;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node test/rules/forbidden-imports.test.mjs`
Expected: prints `forbidden-imports.test ok`

- [ ] **Step 6: Commit**

```bash
git add rules/forbidden-imports.mjs test/fixtures/forbidden-imports test/rules/forbidden-imports.test.mjs
git commit -m "feat: forbidden-imports rule"
```

---

### Task 8: Rule `file-responsibility`

Line-count threshold (info), plus a self-reflection nudge when data-fetching + JSX co-exist over a smaller threshold (the "mixed signals" híbrido, enfoque A).

**Files:**
- Create: `rules/file-responsibility.mjs`, `test/fixtures/file-responsibility/bad/big.tsx`, `test/fixtures/file-responsibility/good/clean.tsx`, `test/rules/file-responsibility.test.mjs`

- [ ] **Step 1: Create fixtures**

Generate `test/fixtures/file-responsibility/bad/big.tsx` (≥ 401 lines, mixing fetch + JSX):
```bash
mkdir -p test/fixtures/file-responsibility/bad test/fixtures/file-responsibility/good
{
  echo 'import React from "react";';
  echo 'export default function Big() {';
  echo '  const load = async () => { const r = await fetch("/api/x"); return r.json(); };';
  for i in $(seq 1 401); do echo "  const v$i = $i; // filler line"; done
  echo '  return <div onClick={load}>{v1}</div>;';
  echo '}';
} > test/fixtures/file-responsibility/bad/big.tsx
```

`test/fixtures/file-responsibility/good/clean.tsx`:
```tsx
export default function Clean({ items }: { items: string[] }) {
  return <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>;
}
```

- [ ] **Step 2: Write the failing test**

```js
// test/rules/file-responsibility.test.mjs
import { readFileSync } from 'node:fs';
import rule from '../../rules/file-responsibility.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, maxLines: 400, mixedSignalsLines: 200 };
const big = readFileSync(new URL('../fixtures/file-responsibility/bad/big.tsx', import.meta.url), 'utf8');
const clean = readFileSync(new URL('../fixtures/file-responsibility/good/clean.tsx', import.meta.url), 'utf8');

const bigF = rule(big, 'big.tsx', cfg);
assert.ok(bigF.some((f) => f.message.includes('líneas')), 'flags line count');
assert.ok(bigF.some((f) => /responsabilidad/i.test(f.message)), 'mixed-signals nudge');
assert.ok(bigF.every((f) => f.rule === 'file-responsibility'));

assert.equal(rule(clean, 'clean.tsx', cfg).length, 0, 'small clean file is fine');
console.log('file-responsibility.test ok');
```

- [ ] **Step 3: Run to verify it fails**

Run: `node test/rules/file-responsibility.test.mjs`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement `rules/file-responsibility.mjs`**

```js
// rules/file-responsibility.mjs
// Híbrido (enfoque A): el script marca la señal; el agente del loop juzga la separación.
const FETCH_SIGNAL = /\b(fetch\(|axios|useQuery|useSWR|\.from\(|createClient\()/;
const JSX_SIGNAL = /return\s*\(?\s*</;

export default function fileResponsibility(content, _filePath, config = {}) {
  if (config.enabled === false) return [];
  const maxLines = config.maxLines ?? 400;
  const mixedAt = config.mixedSignalsLines ?? 200;
  const lineCount = content.split('\n').length;
  const out = [];

  if (lineCount >= maxLines) {
    out.push({ rule: 'file-responsibility', severity: 'info',
      message: `${lineCount} líneas (umbral ${maxLines}). Evaluá separar responsabilidades en módulos más chicos.` });
  }
  if (lineCount >= mixedAt && FETCH_SIGNAL.test(content) && JSX_SIGNAL.test(content)) {
    out.push({ rule: 'file-responsibility', severity: 'info',
      message: `Mezcla fetching de datos + JSX + lógica en un archivo de ${lineCount} líneas. ¿Conviene separar responsabilidades (data layer / presentación)? Reflexioná antes de seguir.` });
  }
  return out;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node test/rules/file-responsibility.test.mjs`
Expected: prints `file-responsibility.test ok`

- [ ] **Step 6: Commit**

```bash
git add rules/file-responsibility.mjs test/fixtures/file-responsibility test/rules/file-responsibility.test.mjs
git commit -m "feat: file-responsibility rule"
```

---

### Task 9: Rule registry + orchestrator — `rules/index.mjs` + `hooks/detect.mjs`

**Files:**
- Create: `rules/index.mjs`, `hooks/detect.mjs`, `test/detect.test.mjs`

- [ ] **Step 1: Create `rules/index.mjs`**

```js
// rules/index.mjs
import secrets from './secrets.mjs';
import hardcodedData from './hardcoded-data.mjs';
import forbiddenImports from './forbidden-imports.mjs';
import fileResponsibility from './file-responsibility.mjs';

export const RULES = {
  'secrets': secrets,
  'hardcoded-data': hardcodedData,
  'forbidden-imports': forbiddenImports,
  'file-responsibility': fileResponsibility,
};
```

- [ ] **Step 2: Write the failing test**

```js
// test/detect.test.mjs
import { runDetector } from '../hooks/detect.mjs';
import assert from 'node:assert/strict';

// out-of-scope file => no findings, no throw
assert.deepEqual(runDetector('README.md', { content: 'sk_live_aaaaaaaaaaaaaaaaaa' }).findings, []);

// in-scope file with a secret => finding
const r = runDetector('lib/keys.ts', { content: 'const k = "sk_live_51H8aQwEXAMPLEabcdef0123456789";' });
assert.ok(r.findings.length >= 1, 'detects secret');
assert.ok(r.text.includes('praxis-guard'), 'formatted text present');

// a rule that throws must not break detection (simulate via disabling none; ensure no throw on weird input)
assert.doesNotThrow(() => runDetector('x.tsx', { content: '' }));
console.log('detect.test ok');
```

- [ ] **Step 3: Run to verify it fails**

Run: `node test/detect.test.mjs`
Expected: FAIL — cannot find `hooks/detect.mjs`

- [ ] **Step 4: Implement `hooks/detect.mjs`**

```js
// hooks/detect.mjs
import { readFileSync } from 'node:fs';
import { RULES } from '../rules/index.mjs';
import { loadConfig, defaultProjectConfigPath } from '../lib/config.mjs';
import { isInScope } from '../lib/scope.mjs';
import { formatFindings } from '../lib/findings.mjs';

// runDetector(filePath, { content?, config? }) -> { findings, text }
export function runDetector(filePath, { content, config } = {}) {
  const cfg = config || loadConfig({ projectConfigPath: defaultProjectConfigPath() });
  if (!isInScope(filePath, cfg)) return { findings: [], text: '' };

  let src = content;
  if (src == null) {
    try { src = readFileSync(filePath, 'utf8'); }
    catch { return { findings: [], text: '' }; } // unreadable -> silent
  }

  const findings = [];
  for (const [id, fn] of Object.entries(RULES)) {
    const ruleCfg = (cfg.rules && cfg.rules[id]) || {};
    if (ruleCfg.enabled === false) continue;
    try {
      const res = fn(src, filePath, ruleCfg);
      if (Array.isArray(res)) findings.push(...res);
    } catch { /* a broken rule never breaks detection */ }
  }
  return { findings, text: formatFindings(findings, filePath) };
}

// CLI entry: `node hooks/detect.mjs <file>` -> prints warnings (exit 0 always).
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const file = process.argv[2];
  if (file) {
    try {
      const { text } = runDetector(file);
      if (text) process.stdout.write(text + '\n');
    } catch { /* never fail the caller */ }
  }
  process.exit(0);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node test/detect.test.mjs`
Expected: prints `detect.test ok`

- [ ] **Step 6: Smoke-test the CLI entry**

Run: `node hooks/detect.mjs test/fixtures/secrets/bad/keys.ts`
Expected: prints a `⚠️ praxis-guard` block listing secrets findings.

- [ ] **Step 7: Commit**

```bash
git add rules/index.mjs hooks/detect.mjs test/detect.test.mjs
git commit -m "feat: detector orchestrator + CLI entry"
```

---

### Task 10: Aggregate test runner — `test/run.mjs`

**Files:**
- Create: `test/run.mjs`

- [ ] **Step 1: Implement `test/run.mjs`**

```js
// test/run.mjs — runs every *.test.mjs under test/, fails loudly on first error.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.test.mjs')) acc.push(p);
  }
  return acc;
}

const root = new URL('.', import.meta.url).pathname;
const files = walk(root);
let failed = 0;
for (const f of files) {
  try { await import(pathToFileURL(f).href); }
  catch (e) { failed++; console.error(`FAIL ${f}\n`, e.message); }
}
console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: `N/N test files passed`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add test/run.mjs
git commit -m "test: aggregate runner"
```

**CHECKPOINT — core engine complete.** The detector works standalone (`node hooks/detect.mjs <file>`) and is fully tested with no CLI dependency. Everything after this is wiring.

---

## Phase 2 — CLI adapters

### Task 11: Shared hook adapter — `hooks/hook-adapter.mjs`

Bridges the 4 command-type hooks. Reads JSON on stdin, defensively extracts tool name + edited file path (incl. Codex `apply_patch` patch parsing), runs the detector, emits the right `additionalContext` envelope per `--cli`. **Always exits 0.**

Research basis (per-CLI stdin/stdout, all confirmed 2026-06-12):
- Claude Code: stdin `tool_name`, `tool_input.file_path`; out `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"..."}}`.
- Gemini CLI: stdin `tool_name` (`write_file`/`replace`), `tool_input.{file_path|path|absolute_path}`; out `{"hookSpecificOutput":{"hookEventName":"AfterTool","additionalContext":"..."}}`. **stdout must be JSON-only.**
- Codex CLI: stdin `tool_name` (`apply_patch`), path inside `tool_input.command` patch text (`*** Update File: <path>` / `*** Add File: <path>`); out `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"..."}}`.
- Copilot CLI: stdin `toolName`, `toolArgs.{path|filePath}`; out top-level `{"additionalContext":"..."}` (≤10KB).

**Files:**
- Create: `hooks/hook-adapter.mjs`, `test/hook-adapter.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/hook-adapter.test.mjs
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const ADAPTER = new URL('../hooks/hook-adapter.mjs', import.meta.url).pathname;
const SECRET = 'const k = "sk_live_51H8aQwEXAMPLEabcdef0123456789";';

function run(cli, payload) {
  return execFileSync('node', [ADAPTER, `--cli=${cli}`], {
    input: JSON.stringify(payload), encoding: 'utf8',
  }).trim();
}

// Claude: tool_input.file_path + content passed inline via a temp? We pass content through path-less.
// Adapter reads file from disk; use an in-repo fixture path that contains a secret.
const fixture = new URL('./fixtures/secrets/bad/keys.ts', import.meta.url).pathname;

const claudeOut = run('claude', { tool_name: 'Write', tool_input: { file_path: fixture } });
const claudeJson = JSON.parse(claudeOut);
assert.equal(claudeJson.hookSpecificOutput.hookEventName, 'PostToolUse');
assert.ok(claudeJson.hookSpecificOutput.additionalContext.includes('praxis-guard'));

const copilotOut = run('copilot', { toolName: 'edit', toolArgs: { path: fixture } });
assert.ok(JSON.parse(copilotOut).additionalContext.includes('praxis-guard'));

const geminiOut = run('gemini', { tool_name: 'write_file', tool_input: { absolute_path: fixture } });
assert.equal(JSON.parse(geminiOut).hookSpecificOutput.hookEventName, 'AfterTool');

// Codex: path embedded in apply_patch command text
const codexOut = run('codex', { tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n*** Update File: ${fixture}\n*** End Patch` } });
assert.ok(JSON.parse(codexOut).hookSpecificOutput.additionalContext.includes('praxis-guard'));

// Clean file => empty stdout (no envelope)
const clean = new URL('./fixtures/secrets/good/env.ts', import.meta.url).pathname;
assert.equal(run('claude', { tool_name: 'Write', tool_input: { file_path: clean } }), '');

// Malformed stdin => empty stdout, exit 0 (no throw)
assert.equal(run('claude', {}), '');
console.log('hook-adapter.test ok');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test/hook-adapter.test.mjs`
Expected: FAIL — cannot find `hooks/hook-adapter.mjs`

- [ ] **Step 3: Implement `hooks/hook-adapter.mjs`**

```js
// hooks/hook-adapter.mjs
// Shared bridge for command-type post-edit hooks (Claude / Gemini / Codex / Copilot).
// Reads CLI JSON on stdin, runs the detector, emits the CLI's additionalContext envelope.
// ALWAYS exits 0. Never throws to the caller.
import { runDetector } from './detect.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
    // If nothing is piped, don't hang.
    if (process.stdin.isTTY) resolve('');
  });
}

function getCli() {
  const arg = process.argv.find((a) => a.startsWith('--cli='));
  return arg ? arg.split('=')[1] : 'claude';
}

// Pull the edited file path out of any CLI's payload shape.
function extractPath(evt) {
  const ti = evt.tool_input || evt.toolArgs || evt.tool_args || {};
  const direct = ti.file_path || ti.filePath || ti.path || ti.absolute_path;
  if (direct) return direct;
  // Codex apply_patch: path lives in the patch text under tool_input.command.
  const cmd = ti.command || evt.command;
  if (typeof cmd === 'string') {
    const m = cmd.match(/\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)/);
    if (m) return m[1].trim();
  }
  return null;
}

function envelope(cli, text) {
  if (cli === 'copilot') return JSON.stringify({ additionalContext: text });
  const hookEventName = cli === 'gemini' ? 'AfterTool' : 'PostToolUse';
  return JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: text } });
}

(async () => {
  try {
    const cli = getCli();
    const raw = await readStdin();
    const evt = raw ? JSON.parse(raw) : {};
    const filePath = extractPath(evt);
    if (!filePath) return; // nothing to lint
    const { text } = runDetector(filePath);
    if (text) process.stdout.write(envelope(cli, text));
  } catch {
    /* swallow everything: warn-only, never break the edit */
  } finally {
    process.exit(0);
  }
})();
```

- [ ] **Step 4: Run to verify it passes**

Run: `node test/hook-adapter.test.mjs`
Expected: prints `hook-adapter.test ok`

- [ ] **Step 5: Commit**

```bash
git add hooks/hook-adapter.mjs test/hook-adapter.test.mjs
git commit -m "feat: shared multi-CLI hook adapter"
```

---

### Task 12: Claude Code wiring — `hooks/hooks.json`

**Files:**
- Create: `hooks/hooks.json`

- [ ] **Step 1: Create `hooks/hooks.json`**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/hook-adapter.mjs\" --cli=claude"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify the adapter handles an empty `CLAUDE_PLUGIN_ROOT` gracefully**

Per `cli-plugin-template` claude-code-hooks gotcha: if installed manually, `${CLAUDE_PLUGIN_ROOT}` is empty. The adapter is invoked with a node path; if the path is wrong, node errors out — but that error goes to the hook, not the edit. Confirm warn-only by simulating a clean run:

Run: `echo '{"tool_name":"Write","tool_input":{"file_path":"test/fixtures/secrets/good/env.ts"}}' | node hooks/hook-adapter.mjs --cli=claude; echo "exit=$?"`
Expected: no stdout, `exit=0`.

- [ ] **Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: Claude Code PostToolUse wiring"
```

> **Manual verification (do after install):** restart Claude Code, edit a `.tsx` with a hardcoded array, confirm the warning appears in the transcript. Hooks load at session start.

---

### Task 13: Gemini CLI wiring — `gemini-extension.json` + `GEMINI.md`

Gemini auto-discovers a bundled `hooks/hooks.json`, but its schema uses `AfterTool` and tool names `write_file|replace` — which collide with Claude's `PostToolUse` block in the **same** file. Solution: keep Claude's `hooks/hooks.json` as-is (Gemini ignores `PostToolUse` with a warning) **and** add a Gemini `AfterTool` block to the same file so each CLI reads its own.

**Files:**
- Modify: `hooks/hooks.json`
- Create: `gemini-extension.json`, `GEMINI.md`

- [ ] **Step 1: Add the Gemini block to `hooks/hooks.json`**

Replace the file with both blocks (Claude reads `PostToolUse`, Gemini reads `AfterTool`):
```json
{
  "hooks": {
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

> Note: `$GEMINI_PROJECT_DIR` points at the project root, not the extension dir. If the extension is installed outside the project, replace with the extension's resolved path during install (see Task 17). Verify the path field carrying the edited file via a dry-run (research flagged it as inferred): temporarily set the command to dump stdin to a temp file and inspect.

- [ ] **Step 2: Create `gemini-extension.json`**

```json
{
  "name": "nextjs-praxis-guard",
  "version": "0.1.0",
  "contextFileName": "GEMINI.md"
}
```

- [ ] **Step 3: Create `GEMINI.md`**

```markdown
# nextjs-praxis-guard (Gemini context)

@./AGENTS.md

Este plugin corre un linter de buenas praxis después de cada edición de archivo
(hook `AfterTool`) y te inyecta avisos como `additionalContext`. No bloquea: si ves
un aviso de `praxis-guard`, corregilo en el flujo.
```

- [ ] **Step 4: Re-run the suite (no regressions)**

Run: `npm test`
Expected: all pass (hooks.json is data; no test couples to its shape).

- [ ] **Step 5: Commit**

```bash
git add hooks/hooks.json gemini-extension.json GEMINI.md
git commit -m "feat: Gemini CLI AfterTool wiring + extension manifest"
```

> **CAVEAT (record in README):** Gemini CLI is slated to be replaced by **Antigravity CLI on 2026-06-18**. Re-verify the hooks schema against Antigravity before relying on it.

---

### Task 14: Codex CLI wiring — `.codex-plugin/plugin.json` + bundled hooks

Codex reads a bundled `hooks/hooks.json` (or `.codex/hooks.json`). Its schema (`PostToolUse`, matcher `apply_patch`) differs enough that bundling it in the same multi-block file as Claude/Gemini risks Codex misreading the Claude block. Ship Codex its own file under `cli/` to drop into the target `.codex/`.

**Files:**
- Create: `.codex-plugin/plugin.json`, `cli/codex-hooks.json`

- [ ] **Step 1: Create `.codex-plugin/plugin.json`**

```json
{
  "name": "nextjs-praxis-guard",
  "version": "0.1.0",
  "description": "Warn-only Next.js praxis guard (Codex)."
}
```

- [ ] **Step 2: Create `cli/codex-hooks.json`**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "apply_patch",
        "hooks": [
          { "type": "command", "timeout": 30,
            "statusMessage": "praxis-guard lint",
            "command": "node \"$(git rev-parse --show-toplevel)/hooks/hook-adapter.mjs\" --cli=codex" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Validate the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('cli/codex-hooks.json','utf8')); console.log('codex json ok')"`
Expected: `codex json ok`

- [ ] **Step 4: Commit**

```bash
git add .codex-plugin/plugin.json cli/codex-hooks.json
git commit -m "feat: Codex CLI PostToolUse wiring"
```

> The `command` field above assumes the plugin's `hooks/` is reachable from the repo root. The installer (Task 17) rewrites the path when the plugin lives elsewhere.

---

### Task 15: Copilot CLI wiring — `.copilot-plugin/plugin.json` + `.github/hooks` JSON

Copilot reads `.github/hooks/*.json` (repo-level) or `~/.copilot/hooks/`. Provide the drop-in file.

**Files:**
- Create: `.copilot-plugin/plugin.json`, `cli/copilot-hooks.json`

- [ ] **Step 1: Create `.copilot-plugin/plugin.json`**

```json
{
  "name": "nextjs-praxis-guard",
  "version": "0.1.0",
  "description": "Warn-only Next.js praxis guard (Copilot CLI)."
}
```

- [ ] **Step 2: Create `cli/copilot-hooks.json`**

```json
{
  "version": 1,
  "hooks": {
    "postToolUse": [
      {
        "type": "command",
        "matcher": "edit|write|Edit|Write",
        "bash": "node \"$(git rev-parse --show-toplevel)/hooks/hook-adapter.mjs\" --cli=copilot",
        "timeoutSec": 30
      }
    ]
  }
}
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('cli/copilot-hooks.json','utf8')); console.log('copilot json ok')"`
Expected: `copilot json ok`

- [ ] **Step 4: Commit**

```bash
git add .copilot-plugin/plugin.json cli/copilot-hooks.json
git commit -m "feat: Copilot CLI postToolUse wiring"
```

> **Verify matcher on first run** (research-flagged inference): the exact `toolName` Copilot emits for edits may be `edit`/`Edit`/`Write`. The matcher above covers the likely set; confirm by logging `$INPUT` once. Copilot caps `additionalContext` at 10KB — the formatter output is far smaller.

---

### Task 16: OpenCode wiring — `opencode.json` + JS plugin

OpenCode uses a JS plugin with `tool.execute.after`. It calls the same core engine and surfaces via `client.app.log` (context-injection-to-agent is unverified per research → v1 logs, best effort).

**Files:**
- Create: `opencode.json`, `cli/opencode-plugin.mjs`

- [ ] **Step 1: Create `opencode.json`**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": []
}
```

- [ ] **Step 2: Create `cli/opencode-plugin.mjs`**

```js
// cli/opencode-plugin.mjs
// Drop into <project>/.opencode/plugins/ (or ~/.config/opencode/plugins/).
// Adjust DETECT_PATH to where nextjs-praxis-guard is installed.
import { runDetector } from "../../hooks/detect.mjs"; // <- installer rewrites this path

export const PraxisGuard = async ({ client, directory }) => {
  return {
    "tool.execute.after": async (input) => {
      if (input.tool !== "write" && input.tool !== "edit") return;
      const filePath = input.args?.filePath || input.args?.path;
      if (!filePath) return;
      try {
        const abs = filePath.startsWith("/") ? filePath : `${directory}/${filePath}`;
        const { text } = runDetector(abs);
        if (text) {
          await client.app.log({
            body: { service: "praxis-guard", level: "warn", message: text, extra: { file: filePath } },
          });
        }
      } catch { /* warn-only */ }
    },
  };
};
```

- [ ] **Step 3: Syntax-check the plugin file**

Run: `node --check cli/opencode-plugin.mjs`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add opencode.json cli/opencode-plugin.mjs
git commit -m "feat: OpenCode tool.execute.after plugin"
```

> **Limitation (record in README):** OpenCode surfaces warnings to its log stream; reliable re-injection into the agent's reasoning context is unverified. v1 ships log-based; revisit when the SDK session-message path is confirmed.

---

### Task 17: Installer + instruction files — `bin/install-hooks.mjs`, `AGENTS.md`, `CLAUDE.md`

Claude/Gemini auto-load bundled files; Copilot/Codex/OpenCode need their hook dropped into the target project with the correct absolute path to `hook-adapter.mjs`/`detect.mjs`.

**Files:**
- Create: `AGENTS.md`, `bin/install-hooks.mjs`
- Create symlink: `CLAUDE.md -> AGENTS.md`

- [ ] **Step 1: Create `AGENTS.md`**

```markdown
# nextjs-praxis-guard

Plugin multi-CLI que vigila buenas praxis en Next.js. Tras cada edición de archivo, un
linter determinístico revisa el archivo y, si encuentra problemas, te inyecta un aviso
`praxis-guard` (no bloquea). Reglas: `secrets`, `hardcoded-data`, `forbidden-imports`,
`file-responsibility`. Config por proyecto en `.claude/nextjs-praxis-guard.json`.

Si ves un aviso de `praxis-guard`, corregí el problema en el flujo antes de continuar.

## Soporte por CLI
- Claude Code: hook `PostToolUse` (bundled `hooks/hooks.json`).
- Gemini CLI: hook `AfterTool` (bundled). Ojo: transición a Antigravity CLI (2026-06-18).
- Codex CLI: hook `PostToolUse` (`cli/codex-hooks.json` → `.codex/`).
- Copilot CLI: hook `postToolUse` (`cli/copilot-hooks.json` → `.github/hooks/`).
- OpenCode: plugin `tool.execute.after` (`cli/opencode-plugin.mjs` → `.opencode/plugins/`).

Para Copilot/Codex/OpenCode: `node bin/install-hooks.mjs --target <project> --cli <name>`.
```

- [ ] **Step 2: Create the symlink**

Run: `ln -sf AGENTS.md CLAUDE.md`
Expected: `CLAUDE.md` resolves to `AGENTS.md`.

- [ ] **Step 3: Implement `bin/install-hooks.mjs`**

```js
// bin/install-hooks.mjs
// Wires the non-auto-loading CLIs (copilot|codex|opencode) into a target project,
// rewriting the path to this plugin's hooks so the hook can find detect.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`)) ||
            (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : null);
  return a ? a.replace(`--${name}=`, '') : def;
}

const target = resolve(arg('target', process.cwd()));
const cli = arg('cli');
const adapter = join(PLUGIN_ROOT, 'hooks', 'hook-adapter.mjs');

function writeHookFile(destDir, fileName, srcRel, cliName) {
  mkdirSync(destDir, { recursive: true });
  let json = readFileSync(join(PLUGIN_ROOT, srcRel), 'utf8')
    .replace(/\$\(git rev-parse --show-toplevel\)\/hooks\/hook-adapter\.mjs/g, adapter);
  const dest = join(destDir, fileName);
  writeFileSync(dest, json);
  console.log(`installed ${cliName} hook -> ${dest}`);
}

switch (cli) {
  case 'copilot':
    writeHookFile(join(target, '.github', 'hooks'), 'praxis-guard.json', 'cli/copilot-hooks.json', 'copilot');
    break;
  case 'codex':
    writeHookFile(join(target, '.codex'), 'hooks.json', 'cli/codex-hooks.json', 'codex');
    break;
  case 'opencode': {
    const destDir = join(target, '.opencode', 'plugins');
    mkdirSync(destDir, { recursive: true });
    const detect = join(PLUGIN_ROOT, 'hooks', 'detect.mjs');
    const body = readFileSync(join(PLUGIN_ROOT, 'cli/opencode-plugin.mjs'), 'utf8')
      .replace('"../../hooks/detect.mjs"', JSON.stringify(detect));
    const dest = join(destDir, 'praxis-guard.mjs');
    writeFileSync(dest, body);
    console.log(`installed opencode plugin -> ${dest}`);
    break;
  }
  default:
    console.error('usage: node bin/install-hooks.mjs --target <dir> --cli <copilot|codex|opencode>');
    process.exit(1);
}
```

- [ ] **Step 4: Test the installer into a temp dir**

Run:
```bash
TMP=$(mktemp -d); node bin/install-hooks.mjs --target "$TMP" --cli copilot && cat "$TMP/.github/hooks/praxis-guard.json" | head -5; rm -rf "$TMP"
```
Expected: prints `installed copilot hook -> ...` and the JSON shows the absolute adapter path (no `git rev-parse`).

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CLAUDE.md bin/install-hooks.mjs
git commit -m "feat: installer for non-auto CLIs + AGENTS.md instructions"
```

---

## Phase 3 — Docs, hygiene, real-world validation

### Task 18: README (multi-CLI) + `.portabilityignore`

**Files:**
- Modify: `README.md`
- Create: `.portabilityignore`

- [ ] **Step 1: Rewrite `README.md`** with: what it is; the 4 rules; per-CLI install (Claude/Gemini auto; `node bin/install-hooks.mjs` for Copilot/Codex/OpenCode); config (`.claude/nextjs-praxis-guard.json` with a `forbidden-imports` example + threshold override); how to read a finding; the Gemini→Antigravity and OpenCode-log-only caveats; `npm test`.

- [ ] **Step 2: Create `.portabilityignore`** (the `cli/*.json` templates intentionally contain `$(git rev-parse ...)` placeholders rewritten at install):

```
cli/codex-hooks.json
cli/copilot-hooks.json
```

- [ ] **Step 3: Commit**

```bash
git add README.md .portabilityignore
git commit -m "docs: multi-CLI README + portability ignore"
```

---

### Task 19: Portability audit + real Next.js validation

**Files:**
- Create: `test/fixtures/integration/AppContext.tsx`

- [ ] **Step 1: Create a realistic bad fixture** mirroring the spec's pain case (`MARCAS_LIST`, `MIEMBROS_REFS`, `SOLICITANTES`):

```tsx
// test/fixtures/integration/AppContext.tsx
import { createContext } from "react";
export const MARCAS_LIST = ["Nike","Adidas","Puma","Reebok","Fila","Asics","Vans","Converse","NewBalance","Under Armour"];
export const SOLICITANTES = ["Ana Pérez","Juan Gómez","Marta Ruiz","Luis Díaz","Sofía Romero","Pedro Sosa","Lucía Vera","Diego Mora"];
const KEY = "sk_live_51H8aQwEXAMPLEabcdef0123456789ABCDEF";
export const AppContext = createContext(null);
```

- [ ] **Step 2: Run the detector on it**

Run: `node hooks/detect.mjs test/fixtures/integration/AppContext.tsx`
Expected: a `⚠️ praxis-guard` block with at least: two `hardcoded-data` findings (MARCAS_LIST, SOLICITANTES) and one `secrets` finding (the `sk_live_` key).

- [ ] **Step 3: Run the portability-audit feature** (from `cli-plugin-template`) and fix any real findings:

Run: `npm test`
Expected: full suite green.

> If `cli-plugin-template` exposes a portability scan command/script, run it now and resolve absolute-path / `model:`/secret findings. The `cli/*.json` placeholders are already excluded via `.portabilityignore`.

- [ ] **Step 4: Commit**

```bash
git add test/fixtures/integration/AppContext.tsx
git commit -m "test: real-world Next.js integration fixture"
```

- [ ] **Step 5: Register the plugin in the evolution registry**

Invoke `cli-plugin-template:plugin-register` so the meta-plugin manages this plugin's growth (per TODO Q1 item 3).

---

## Self-review (run against the spec)

**Spec coverage:**
- Híbrido determinístico + auto-reflexión → Tasks 5–8; `file-responsibility` injects a self-reflection nudge (enfoque A). ✓
- Warn, never block → all findings `info|warn`; adapter exits 0 always; `additionalContext` (non-blocking) not `exit 2`. ✓
- 4 rules → Tasks 5,6,7,8. ✓
- Node `.mjs`, no deps → engine + adapter pure Node ESM. ✓
- Config genérica + por proyecto → Task 3 (`defaults.json` + `.claude/nextjs-praxis-guard.json`, deep-merge). ✓
- Tests good+bad per rule → fixtures in Tasks 5–8; runner Task 10. ✓
- Never breaks the edit (exit 0, timeout) → adapter try/catch+exit 0; per-CLI `timeout` set. ✓
- Multi-CLI real (user decision) → Tasks 11–17, one native post-edit hook per CLI on a shared core. ✓
- TODO Q1 scaffold + register → Tasks 1, 19.5. ✓

**Gaps / deferred (out of v1 per spec):** AST parsing, `error` severity/blocking, knowledge skills, scaffolding slash-commands, on-demand audits. A `health-check` skill (cli-plugin-template feature) is recommended but optional; add as a follow-up task if desired.

**Type consistency:** `runDetector` returns `{ findings, text }` everywhere; rule signature `(content, filePath, ruleConfig) => Finding[]` consistent across Tasks 5–9; `formatFindings(findings, filePath)` consistent. ✓

**Placeholder scan:** the `$(git rev-parse ...)` strings in `cli/*.json` are intentional install-time placeholders (rewritten by Task 17 installer, excluded by `.portabilityignore`) — not plan placeholders. No TBD/TODO-in-code. ✓

---

## Open verification items (carry into execution)

1. **Per-CLI field names / matchers are partly inferred** (Gemini path field; Copilot `toolName`; Codex apply_patch path). Each wiring task includes a stdin-dump dry-run to confirm before relying on it.
2. **Gemini → Antigravity CLI (2026-06-18)** — re-verify hooks schema post-transition.
3. **OpenCode context re-injection** unverified — v1 is log-based.
4. **Claude Code `additionalContext` for PostToolUse** — confirm the exact envelope your Claude Code build honors (vs. `exit 2`/stderr) during manual verification in Task 12.
