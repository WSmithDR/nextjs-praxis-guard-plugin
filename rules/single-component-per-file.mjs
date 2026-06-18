// rules/single-component-per-file.mjs
// Flags más de un componente React declarado a nivel de módulo en un mismo archivo.
// Convención: un componente por archivo (más fácil de testear, importar y reusar).
//
// Heurística (regex, corre en el hook): cuenta declaraciones TOP-LEVEL PascalCase que son
// funciones o arrows, en un archivo .tsx/.jsx con JSX. Subcomponentes anidados (indentados)
// NO cuentan acá — son otro patrón. forwardRef/HOC y arrows genéricos `<T,>(...)` pueden
// pasar de largo (conservador: preferimos no marcar de más).
//
// `ignore` (globs): archivos que legítimamente co-locan varios componentes (stories, tests).
import { matchGlob } from '../lib/glob.mjs';

const JSX = /<[A-Za-z][\w.]*[\s/>]|<>/;
// función top-level:  (export)(default)(async) function Foo(  |  con genéricos Foo<
const FN_DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Z]\w*)\s*[(<]/gm;
// const arrow top-level que toma props:  const Foo = (...) =>  |  const Foo: FC = (...): T =>
const ARROW_DECL = /^(?:export\s+)?(?:default\s+)?const\s+([A-Z]\w*)\s*(?::[^=\n]+)?=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=>{]+)?=>/gm;

export default function singleComponentPerFile(content, filePath = '', config = {}) {
  if (config.enabled === false) return [];
  const path = String(filePath).replace(/\\/g, '/');
  if (!/\.(tsx|jsx)$/.test(path)) return [];
  if ((config.ignore || []).some((g) => matchGlob(path, g))) return [];   // stories, tests, etc.
  if (!JSX.test(content)) return [];

  const names = new Set();
  for (const re of [FN_DECL, ARROW_DECL]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) names.add(m[1]);
  }
  if (names.size < 2) return [];

  return [{ rule: 'single-component-per-file', severity: 'warn',
    message: `${names.size} componentes en un mismo archivo (${[...names].join(', ')}). Convención: un componente por archivo — mové los demás a su propio archivo.` }];
}
