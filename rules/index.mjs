// rules/index.mjs
import secrets from './secrets.mjs';
import hardcodedData from './hardcoded-data.mjs';
import forbiddenImports from './forbidden-imports.mjs';
import fileResponsibility from './file-responsibility.mjs';
import untranslatedText from './untranslated-text.mjs';
import folderPlacement from './folder-placement.mjs';
import layerBoundaries from './layer-boundaries.mjs';
import serverClientBoundaries from './server-client-boundaries.mjs';
import featureDeps from './feature-deps.mjs';
import architectureCoherence from './architecture-coherence.mjs';

// File rules: (content, filePath, ruleConfig, fullConfig) => Finding[]
// Corren en el hook PostToolUse y, por archivo, en la auditoría.
export const RULES = {
  'secrets': secrets,
  'hardcoded-data': hardcodedData,
  'forbidden-imports': forbiddenImports,
  'file-responsibility': fileResponsibility,
  'untranslated-text': untranslatedText,
  'folder-placement': folderPlacement,
  'layer-boundaries': layerBoundaries,
  'server-client-boundaries': serverClientBoundaries,
  'feature-deps': featureDeps,
};

// Project rules: (projectTree, fullConfig) => Finding[]
// Corren SOLO en la auditoría (miran el árbol del proyecto).
export const PROJECT_RULES = {
  'architecture-coherence': architectureCoherence,
};
