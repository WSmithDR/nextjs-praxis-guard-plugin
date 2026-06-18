// rules/thin-route-pages.mjs
// File rule (opt-in): en by-feature, app/**/page.tsx solo debe montar el componente público
// de la feature — pocas líneas, sin estado/hooks, sin JSX estructural de negocio. Que la
// lógica vuelva a la capa de ruteo es justo lo que el refactor by-feature elimina.
// Respeta route groups: los `(group)` son segmentos normales del path, los cruza el `.*`.
const HOOKS = /\buse(State|Effect|Reducer|Ref|Context|Callback|Memo|LayoutEffect)\s*\(/;
const LOWER_TAG = /<[a-z][\w-]*[\s/>]/g;   // tags HTML (estructura), no componentes (PascalCase)
const IS_PAGE = /(^|\/)app\/(?:.*\/)?page\.(tsx|jsx)$/;

export default function thinRoutePages(content, filePath = '', config = {}, full = {}) {
  if (config.enabled === false) return [];
  if ((full.architecture || {}).strategy == null) return [];   // opt-in: convención by-feature
  const path = String(filePath).replace(/\\/g, '/');
  if (!IS_PAGE.test(path)) return [];

  const maxLines = config.maxLines ?? 30;
  const maxTags = config.maxStructuralTags ?? 2;
  const reasons = [];

  const lineCount = content.split('\n').length;
  if (lineCount > maxLines) reasons.push(`${lineCount} líneas (umbral ${maxLines})`);
  if (HOOKS.test(content)) reasons.push('usa estado/hooks (useState/useEffect/…)');
  const tags = (content.match(LOWER_TAG) || []).length;
  if (tags > maxTags) reasons.push(`${tags} tags HTML estructurales`);
  if (!reasons.length) return [];

  const feat = (full.architecture && full.architecture.featuresDir) || 'features/';
  return [{ rule: 'thin-route-pages', severity: 'warn',
    message: `page.tsx con lógica en la capa de ruteo (${reasons.join('; ')}). La ruta solo debería montar el componente público de la feature — mové la lógica/JSX a ${feat} y dejá la página fina.` }];
}
