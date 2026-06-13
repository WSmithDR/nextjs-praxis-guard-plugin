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
