---
name: praxis-gen-tests
description: Genera el archivo de test de un archivo/componente Next.js. Motor determinista (detecta framework, ruta y firma) + el agente escribe los casos. Invocar cuando el usuario dice "generá tests para <archivo>", "creá el test de este componente", "scaffold de test", o pide un test para un componente/util.
---

# praxis-gen-tests

Genera un archivo de test **de arranque** (casos reales, no exhaustivo) para un archivo o componente.
Motor: `bin/gen-tests.mjs` (determinista). El agente escribe los casos sobre el plan.

## Proceso

1. **Plan:** `node ${CLAUDE_PLUGIN_ROOT}/bin/gen-tests.mjs <archivo> --dir <raíz-del-proyecto>` →
   leé el JSON: `framework`, `testImport`, `testFilePath`, `exists`,
   `component{name, exportKind, isReactComponent, props}`, `hints`.
2. **No pisar:** si `exists: true`, NO sobrescribas. Avisá al usuario y ofrecé: otro nombre, append de
   casos al existente, o cancelar. Esperá su decisión.
3. **Escribir** el archivo en `testFilePath` con `testImport` y casos reales:
   - import del componente según `exportKind` (default vs named) desde el path relativo correcto;
   - **render/smoke** (con `render`/`screen` si `usesRTL`; si es util, llamá la función y assert el retorno);
   - un test por **prop significativa** del plan (`on*` → simular y assert el efecto; valores → assert en el render);
   - ramas obvias que veas en el componente.
   Mantenelo **liviano** y decile al usuario que es un punto de partida para extender.
4. **Confirmá** con el usuario antes de crear el archivo (es una acción saliente que escribe en su repo).

## Reglas
- Nunca sobrescribas un test existente sin permiso explícito.
- Si `component` es `null` (no se pudo parsear) o `typescript` no estaba en el proyecto, generá igual un
  esqueleto mínimo con el framework correcto del plan y pedile contexto al usuario.
- Seguí el `framework`/`testImport` del plan; no cambies a otro framework.
- No inventes assertions sobre comportamiento que no podés ver en el componente; preferí menos casos pero ciertos.
