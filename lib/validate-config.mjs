// lib/validate-config.mjs
// Pure validator for a project config object (the thing deep-merged over defaults).
// Returns { ok, errors }. Never throws.
const KNOWN_RULES = ['secrets', 'hardcoded-data', 'forbidden-imports', 'file-responsibility', 'untranslated-text',
  'folder-placement', 'architecture-coherence', 'layer-boundaries', 'server-client-boundaries', 'feature-deps',
  'repeated-object-shape', 'stringly-typed', 'duplicate-literal-union', 'prefer-as-const', 'tsconfig-strictness',
  'tailwind-arbitrary-values', 'tailwind-classname-bloat', 'tailwind-conditional-concat', 'tailwind-duplicate-utilities',
  'type-duplicate-shape', 'inline-shape-extract', 'schema-type-redeclare', 'magic-literal-repeated'];
const NUMERIC_KEYS = ['maxLines', 'mixedSignalsLines', 'minElements', 'minProps', 'minRepeats', 'minLiterals', 'minMembers', 'maxClasses', 'minFiles', 'minLen'];
const RUN_ON = ['deep', 'full'];
const STRATEGIES = ['by-feature', 'by-layer'];
const SEVERITIES = ['info', 'warn', 'error'];

function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function isStringArray(v) { return Array.isArray(v) && v.every((x) => typeof x === 'string'); }

export function validateConfig(obj, extraKnownRules = []) {
  const errors = [];
  if (!isObject(obj)) return { ok: false, errors: ['la config debe ser un objeto JSON'] };

  if ('include' in obj && !isStringArray(obj.include)) errors.push('include debe ser un array de strings');
  if ('exclude' in obj && !isStringArray(obj.exclude)) errors.push('exclude debe ser un array de strings');

  if ('rules' in obj) {
    if (!isObject(obj.rules)) {
      errors.push('rules debe ser un objeto');
    } else {
      for (const [id, rule] of Object.entries(obj.rules)) {
        if (!KNOWN_RULES.includes(id) && !extraKnownRules.includes(id)) {
          errors.push(`regla desconocida: "${id}" (válidas: ${KNOWN_RULES.join(', ')}${extraKnownRules.length ? ', ' + extraKnownRules.join(', ') : ''})`);
          continue;
        }
        if (!isObject(rule)) { errors.push(`rules.${id} debe ser un objeto`); continue; }
        if ('enabled' in rule && typeof rule.enabled !== 'boolean') errors.push(`rules.${id}.enabled debe ser boolean`);
        if ('runOn' in rule && !RUN_ON.includes(rule.runOn)) errors.push(`rules.${id}.runOn debe ser uno de: ${RUN_ON.join(', ')}`);
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
        if (id === 'folder-placement' && 'placement' in rule) {
          if (!Array.isArray(rule.placement)) {
            errors.push('rules.folder-placement.placement debe ser un array');
          } else {
            rule.placement.forEach((e, i) => {
              if (!isObject(e) || typeof e.kind !== 'string' || typeof e.match !== 'string' || !isStringArray(e.allowed))
                errors.push(`rules.folder-placement.placement[${i}] debe tener kind, match (strings) y allowed (array de strings)`);
            });
          }
        }
        if (id === 'layer-boundaries' && 'layers' in rule) {
          if (!Array.isArray(rule.layers)) {
            errors.push('rules.layer-boundaries.layers debe ser un array');
          } else {
            rule.layers.forEach((e, i) => {
              if (!isObject(e) || typeof e.name !== 'string' || typeof e.path !== 'string' || !isStringArray(e.mayImport))
                errors.push(`rules.layer-boundaries.layers[${i}] debe tener name, path (strings) y mayImport (array de strings)`);
            });
          }
        }
        if (id === 'server-client-boundaries' && 'serverOnly' in rule && !isStringArray(rule.serverOnly)) {
          errors.push('rules.server-client-boundaries.serverOnly debe ser array de strings');
        }
        if (id === 'feature-deps' && 'publicEntry' in rule && !isStringArray(rule.publicEntry)) {
          errors.push('rules.feature-deps.publicEntry debe ser array de strings');
        }
        if (id === 'tsconfig-strictness' && 'baseline' in rule && !isStringArray(rule.baseline)) {
          errors.push('rules.tsconfig-strictness.baseline debe ser array de strings');
        }
        if (id === 'tailwind-arbitrary-values' && 'allow' in rule && !isStringArray(rule.allow)) {
          errors.push('rules.tailwind-arbitrary-values.allow debe ser array de strings');
        }
      }
    }
  }

  if ('architecture' in obj) {
    const a = obj.architecture;
    if (!isObject(a)) {
      errors.push('architecture debe ser un objeto');
    } else {
      if ('strategy' in a && a.strategy !== null && !STRATEGIES.includes(a.strategy))
        errors.push(`architecture.strategy debe ser null o uno de: ${STRATEGIES.join(', ')}`);
      for (const k of ['root', 'featuresDir']) {
        if (k in a && typeof a[k] !== 'string') errors.push(`architecture.${k} debe ser string`);
      }
      if ('sharedDirs' in a && !isStringArray(a.sharedDirs)) errors.push('architecture.sharedDirs debe ser array de strings');
    }
  }

  if ('commit' in obj) {
    const c = obj.commit;
    if (!isObject(c)) {
      errors.push('commit debe ser un objeto');
    } else {
      for (const k of ['check', 'block']) {
        if (k in c && typeof c[k] !== 'boolean') errors.push(`commit.${k} debe ser boolean`);
      }
      if ('minSeverity' in c && !SEVERITIES.includes(c.minSeverity))
        errors.push(`commit.minSeverity debe ser uno de: ${SEVERITIES.join(', ')}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
