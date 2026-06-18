// rules/descriptive-component-names.mjs
// Marca nombres de componente genéricos/vagos (Card, Item, Box, Wrapper, …): un componente
// exportado PascalCase que devuelve JSX y cuyo nombre ES exactamente una palabra genérica
// (sin prefijo de dominio). Un nombre que describe el rol (SectionCard, MemberCard) hace el
// código navegable sin abrirlo; los vagos se confunden cuando hay varios parecidos.
//
// Solo marca el nombre PELADO: `Card` → warn, `SectionCard` → ok. Blocklist y excepciones (`allow`)
// configurables. Mismo detector top-level que single-component-per-file (subcomponentes anidados
// indentados no cuentan).
const JSX = /<[A-Za-z][\w.]*[\s/>]|<>/;
const FN_DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Z]\w*)\s*[(<]/gm;
const ARROW_DECL = /^(?:export\s+)?(?:default\s+)?const\s+([A-Z]\w*)\s*(?::[^=\n]+)?=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=>{]+)?=>/gm;
const DEFAULT_BLOCKLIST = ['Card', 'Item', 'Box', 'Wrapper', 'Data', 'Component', 'Thing', 'El', 'Comp'];

export default function descriptiveComponentNames(content, filePath = '', config = {}) {
  if (config.enabled === false) return [];
  if (!/\.(tsx|jsx)$/.test(String(filePath))) return [];
  if (!JSX.test(content)) return [];

  const blocklist = new Set((config.blocklist || DEFAULT_BLOCKLIST).map(String));
  const allow = new Set((config.allow || []).map(String));
  const lineOf = (idx) => content.slice(0, idx).split('\n').length;

  const seen = new Set();
  const out = [];
  for (const re of [FN_DECL, ARROW_DECL]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      if (allow.has(name) || !blocklist.has(name)) continue;
      out.push({ rule: 'descriptive-component-names', line: lineOf(m.index), severity: 'warn',
        message: `Nombre de componente genérico "${name}". Renombralo a algo que describa su rol (ej. SectionCard en vez de Card) — los nombres vagos se confunden cuando hay varios componentes parecidos.` });
    }
  }
  return out;
}
