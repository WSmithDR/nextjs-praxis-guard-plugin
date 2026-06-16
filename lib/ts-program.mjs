// lib/ts-program.mjs
// Construye el "programa" de TypeScript del proyecto auditado UNA sola vez.
// typescript se resuelve como PEER (del proyecto), no se bundlea. Si falta o
// algo rompe -> null (las reglas AST se saltean con degradación elegante).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { isInScope } from './scope.mjs';

export async function buildTsContext(projectDir, config = {}) {
  // 1. resolver el typescript DEL PROYECTO (walks up desde projectDir).
  let ts;
  try {
    const req = createRequire(join(projectDir, 'noop.js'));
    const mod = await import(pathToFileURL(req.resolve('typescript')).href);
    ts = mod.default || mod;
    if (typeof ts.createProgram !== 'function') return null;
  } catch { return null; }

  // 2. encontrar y parsear tsconfig.json.
  let configPath;
  try { configPath = ts.findConfigFile(projectDir, ts.sys.fileExists, 'tsconfig.json'); }
  catch { return null; }
  if (!configPath) return null;

  let parsed;
  try {
    parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
      ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {},
    });
  } catch { return null; }
  if (!parsed || !parsed.fileNames || !parsed.fileNames.length) return null;

  // 3. construir programa + checker.
  let program;
  try { program = ts.createProgram(parsed.fileNames, parsed.options); }
  catch { return null; }
  const checker = program.getTypeChecker();

  // 4. archivos in-scope (sin .d.ts ni excluidos).
  const root = projectDir.replace(/\\/g, '/').replace(/\/$/, '');
  const rel = (abs) => abs.replace(/\\/g, '/').replace(root + '/', '');
  const sourceFiles = program.getSourceFiles().filter(
    (sf) => !sf.isDeclarationFile && isInScope(rel(sf.fileName), config));

  return { ts, program, checker, sourceFiles, projectDir, rel };
}
