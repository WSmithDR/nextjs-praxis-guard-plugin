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
