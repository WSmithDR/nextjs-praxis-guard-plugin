// rules/untranslated-text.mjs
// Flags hardcoded user-facing text in JSX (.tsx/.jsx) that isn't routed through a
// variable/expression (e.g. an i18n `t()`). Literal UI strings break i18n / multidioma.
//
// Conservative by design — only reacts to two unambiguous shapes:
//   1. JSX text nodes:  <button>Enviar</button>      -> ">Enviar<"
//   2. User-facing attrs written as a literal: placeholder="Escribí tu nombre"
// Interpolated text ({t('clave')}, {variable}) and attrs via ={...} are skipped, as are
// plain variable assignments (`const title = "x"` has spaces around `=`).
const WORD = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/; // at least one 2+ letter word (accents included)
const TEXT_NODE = />([^<>{}]+)</g;
const DEFAULT_ATTRS = ['placeholder', 'title', 'alt', 'aria-label', 'label'];

function clip(s) {
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

export default function untranslatedText(content, filePath, config = {}) {
  if (config.enabled === false) return [];
  if (!/\.(tsx|jsx)$/.test(filePath)) return [];
  const ignore = config.ignore || [];
  const attrs = config.attributes || DEFAULT_ATTRS;
  const out = [];

  const isIgnored = (s) => ignore.some((ig) => s.includes(ig));
  const lineOf = (idx) => content.slice(0, idx).split('\n').length;

  // 1) JSX text nodes
  TEXT_NODE.lastIndex = 0;
  let m;
  while ((m = TEXT_NODE.exec(content)) !== null) {
    const text = m[1].trim();
    if (!text || !WORD.test(text) || isIgnored(text)) continue;
    out.push({
      rule: 'untranslated-text', line: lineOf(m.index), severity: 'warn',
      message: `Texto literal "${clip(text)}" en JSX sin interpolar. Pasalo por una función i18n (ej. {t('clave')}) para soportar multidioma.`,
    });
  }

  // 2) user-facing attributes written as a literal (attr="texto", no spaces around `=`)
  const attrRe = new RegExp(`\\b(${attrs.join('|')})="([^"]+)"`, 'g');
  while ((m = attrRe.exec(content)) !== null) {
    const text = m[2].trim();
    if (!text || !WORD.test(text) || isIgnored(text)) continue;
    out.push({
      rule: 'untranslated-text', line: lineOf(m.index), severity: 'warn',
      message: `Atributo ${m[1]}="${clip(text)}" con texto literal. Usá una expresión i18n (${m[1]}={t('clave')}) para soportar multidioma.`,
    });
  }

  return out;
}
