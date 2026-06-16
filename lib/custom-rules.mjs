// lib/custom-rules.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RULES, PROJECT_RULES, AST_RULES } from '../rules/index.mjs';

const BUILTIN_IDS = new Set([...Object.keys(RULES), ...Object.keys(PROJECT_RULES), ...Object.keys(AST_RULES)]);

export function customRulesDir(dir) { return join(dir, '.praxis-guard', 'rules'); }

// Carga las reglas custom de .praxis-guard/rules/*.mjs. Nunca lanza.
export async function loadCustomRules(dir) {
  const out = { fileRules: {}, projectRules: {}, astRules: {}, errors: [] };
  let entries;
  try { entries = readdirSync(customRulesDir(dir)); }
  catch { return out; }
  for (const name of entries) {
    if (!name.endsWith('.mjs')) continue;
    const id = name.slice(0, -4);
    if (BUILTIN_IDS.has(id)) { out.errors.push({ id, error: 'colisión con regla built-in' }); continue; }
    let mod;
    try { mod = await import(pathToFileURL(join(customRulesDir(dir), name)).href); }
    catch (e) { out.errors.push({ id, error: String((e && e.message) || e) }); continue; }
    if (typeof mod.default !== 'function') { out.errors.push({ id, error: 'sin default export función' }); continue; }
    const kind = mod.meta && mod.meta.kind;
    if (kind === 'ast') out.astRules[id] = mod.default;
    else if (kind === 'project') out.projectRules[id] = mod.default;
    else out.fileRules[id] = mod.default;
  }
  return out;
}

// Código fuente de cada regla custom (para el fingerprint). No lanza.
export function readCustomRuleSources(dir) {
  const sources = {};
  let entries;
  try { entries = readdirSync(customRulesDir(dir)); }
  catch { return sources; }
  for (const name of entries) {
    if (!name.endsWith('.mjs')) continue;
    const id = name.slice(0, -4);
    if (BUILTIN_IDS.has(id)) continue;
    try { sources[id] = readFileSync(join(customRulesDir(dir), name), 'utf8'); } catch { /* skip */ }
  }
  return sources;
}
