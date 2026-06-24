// rules/index.mjs
import secrets from './secrets.mjs';
import hardcodedData from './hardcoded-data.mjs';
import forbiddenImports from './forbidden-imports.mjs';
import fileResponsibility from './file-responsibility.mjs';
import untranslatedText from './untranslated-text.mjs';
import singleComponentPerFile from './single-component-per-file.mjs';
import inlineMappedComponent from './inline-mapped-component.mjs';
import excessiveUsestate from './excessive-usestate.mjs';
import descriptiveComponentNames from './descriptive-component-names.mjs';
import thinRoutePages from './thin-route-pages.mjs';
import tailwindContentCoverage from './tailwind-content-coverage.mjs';
import folderPlacement from './folder-placement.mjs';
import layerBoundaries from './layer-boundaries.mjs';
import serverClientBoundaries from './server-client-boundaries.mjs';
import featureDeps from './feature-deps.mjs';
import repeatedObjectShape from './repeated-object-shape.mjs';
import stringlyTyped from './stringly-typed.mjs';
import duplicateLiteralUnion from './duplicate-literal-union.mjs';
import preferAsConst from './prefer-as-const.mjs';
import architectureCoherence from './architecture-coherence.mjs';
import tsconfigStrictness from './tsconfig-strictness.mjs';
import tailwindArbitraryValues from './tailwind-arbitrary-values.mjs';
import tailwindClassnameBloat from './tailwind-classname-bloat.mjs';
import tailwindConditionalConcat from './tailwind-conditional-concat.mjs';
import tailwindDuplicateUtilities from './tailwind-duplicate-utilities.mjs';
import typeDuplicateShape from './type-duplicate-shape.mjs';
import inlineShapeExtract from './inline-shape-extract.mjs';
import schemaTypeRedeclare from './schema-type-redeclare.mjs';
import magicLiteralRepeated from './magic-literal-repeated.mjs';
import preferSatisfies from './prefer-satisfies.mjs';
import asConstOpportunity from './as-const-opportunity.mjs';
import preferDiscriminatedUnion from './prefer-discriminated-union.mjs';
import preferBrandedType from './prefer-branded-type.mjs';
import tailwindArbitraryHasToken from './tailwind-arbitrary-has-token.mjs';
import tailwindOffThemeValue from './tailwind-off-theme-value.mjs';

// File rules: (content, filePath, ruleConfig, fullConfig) => Finding[]
// Corren en el hook PostToolUse y, por archivo, en la auditoría.
export const RULES = {
  'secrets': secrets,
  'hardcoded-data': hardcodedData,
  'forbidden-imports': forbiddenImports,
  'file-responsibility': fileResponsibility,
  'untranslated-text': untranslatedText,
  'single-component-per-file': singleComponentPerFile,
  'inline-mapped-component': inlineMappedComponent,
  'excessive-usestate': excessiveUsestate,
  'descriptive-component-names': descriptiveComponentNames,
  'thin-route-pages': thinRoutePages,
  'folder-placement': folderPlacement,
  'layer-boundaries': layerBoundaries,
  'server-client-boundaries': serverClientBoundaries,
  'feature-deps': featureDeps,
  'repeated-object-shape': repeatedObjectShape,
  'stringly-typed': stringlyTyped,
  'duplicate-literal-union': duplicateLiteralUnion,
  'prefer-as-const': preferAsConst,
  'tailwind-arbitrary-values': tailwindArbitraryValues,
  'tailwind-classname-bloat': tailwindClassnameBloat,
  'tailwind-conditional-concat': tailwindConditionalConcat,
  'tailwind-duplicate-utilities': tailwindDuplicateUtilities,
};

// Project rules: (projectTree, fullConfig) => Finding[]
// Corren SOLO en la auditoría (miran el árbol del proyecto).
export const PROJECT_RULES = {
  'architecture-coherence': architectureCoherence,
  'tsconfig-strictness': tsconfigStrictness,
  'magic-literal-repeated': magicLiteralRepeated,
  'tailwind-content-coverage': tailwindContentCoverage,
};

// AST rules: (astContext, fullConfig) => Finding[]
// Corren SOLO en la auditoría profunda (--deep / runOn:'full'). Usan el type-checker.
export const AST_RULES = {
  'type-duplicate-shape': typeDuplicateShape,
  'inline-shape-extract': inlineShapeExtract,
  'schema-type-redeclare': schemaTypeRedeclare,
  'prefer-satisfies': preferSatisfies,
  'as-const-opportunity': asConstOpportunity,
  'prefer-discriminated-union': preferDiscriminatedUnion,
  'prefer-branded-type': preferBrandedType,
  'tailwind-arbitrary-has-token': tailwindArbitraryHasToken,
  'tailwind-off-theme-value': tailwindOffThemeValue,
};
