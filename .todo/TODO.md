# TODO — nextjs-praxis-guard-plugin

> MVP: hook `PostToolUse` que detecta malas praxis en Next.js y **avisa sin bloquear**.
> Diseño completo en `docs/specs/2026-06-12-mvp-praxis-hooks-design.md` (leer primero).
> Multi-CLI vía el meta-plugin `cli-plugin-template`.

## Q1 — Importante + Urgente (arrancar acá)

- [ ] **Scaffold con `cli-plugin-template`** — invocar el meta-plugin para generar la
      estructura multi-CLI del plugin (manifest, hooks dir, compat Claude Code /
      Copilot / Gemini / Codex). Skill: `cli-plugin-template:plugin-dev` o
      `plugin-feature`.
- [ ] **Plan de implementación** — invocar `superpowers:writing-plans` tomando el spec
      como entrada, para detallar pasos + checkpoints de review.
- [ ] **Registrar el plugin en el registry de evolución** — `cli-plugin-template:plugin-register`
      para que el meta-plugin administre su crecimiento (igual que los otros plugins).

## Q2 — Importante + No urgente (el grueso de la construcción)

- [ ] **Interfaz común de regla** — definir el contrato `(content, path, config) => Finding[]`
      y el tipo `Finding` (rule, line?, message, severity 'info'|'warn').
- [ ] **Orquestador `hooks/detect.mjs`** — lee archivo editado + config, corre reglas
      habilitadas, arma `additionalContext`. Node `.mjs` sin dependencias. Nunca rompe
      la edición (exit 0 ante error, timeout corto).
- [ ] **`hooks/hooks.json`** — registrar `PostToolUse` sobre Write|Edit|MultiEdit.
- [ ] **Regla `secrets`** *(determinístico)* — API keys/tokens/connection strings
      hardcodeados. (La más fácil y de mayor valor; buena primera regla.)
- [ ] **Regla `hardcoded-data`** *(determinístico)* — literales grandes de datos de
      dominio en `.tsx`. Dolor #1 del autor.
- [ ] **Regla `forbidden-imports`** *(determinístico, configurable)* — lista por-proyecto,
      vacía por defecto.
- [ ] **Regla `file-responsibility`** *(híbrido)* — umbral de líneas (default 400) +
      señales de mezcla; inyecta nudge de auto-reflexión al agente.
- [ ] **Config `config/defaults.json`** + carga de `.claude/nextjs-praxis-guard.json`
      por proyecto (toggles, umbrales, forbidden-imports).
- [ ] **Tests** — `test/fixtures/` (buenas y malas por regla) + `test/run.mjs` que
      verifica detección y ausencia de falsos positivos en las buenas.

## Q3 — No tan importante + algo urgente

- [ ] **README** — completar con instalación multi-CLI, config, ejemplos de findings.
- [ ] **Probarlo de verdad** sobre Eminat App (`lib/AppContext.tsx` es el caso de
      prueba perfecto: `MARCAS_LIST`, `MIEMBROS_REFS`, `SOLICITANTES`).

## Q4 — Backlog / futuro (NO en v1)

- [ ] Skills de conocimiento/convenciones Next.js.
- [ ] Slash commands de scaffolding (`/new-module`, `/new-api-route`).
- [ ] Auditorías on-demand (performance, a11y, SEO, bundle size).
- [ ] Parsing AST (si los falsos positivos del regex molestan).
- [ ] Severidad `error` / bloqueo de ediciones (opt-in).
- [ ] Publicar en marketplace.
- [ ] **Drift de config al actualizar el plugin** — cuando una versión nueva agrega, quita o renombra una regla, esa regla se activa o desactiva sola sin avisar: `.praxis-guard/config.json` solo guarda diffs y el detector mergea (combina: lo declarado en el proyecto pisa el default, clave por clave) sobre `config/defaults.json`, así que el usuario nunca decide sobre la regla nueva (vuelve el comportamiento "dogmático" que la config interactiva buscaba evitar). _(creado por: SmithDR · 2026-06-13)_
  - _Opción A:_ Registrar `reviewed_rules` (snapshot de ids que el usuario ya decidió) en `.praxis-guard/meta.json` al correr `praxis-config`; en el hook `SessionStart`, comparar `Object.keys(RULES)` actuales − `reviewed_rules` → si hay nuevas, ofrecer `praxis-config` en modo editar solo por ellas. Persistente y explícito, reusa meta.json + SessionStart + la skill. Tradeoff: el usuario debe correr la skill para "marcar como revisada" una regla.
  - _Opción B:_ Guardar el `plugin_version` en meta.json (ya se guarda) y mantener en el plugin un manifiesto de qué reglas existían por versión; al detectar versión distinta, mostrar el diff de reglas entre la versión vieja y la nueva. Más automático (no depende de un snapshot del usuario) pero obliga a mantener un changelog de reglas por versión, que es fácil de olvidar.
  - _Opción C:_ Cambiar la política: toda regla NUEVA entra con `enabled: false` por default en `config/defaults.json` (opt-in), así nunca corre hasta que el usuario la active con `praxis-config`. Cero detección de drift, trivial. Tradeoff: las reglas nuevas no aportan valor hasta que alguien las prende a mano, en contra de "traer buenos defaults".
  - **Recomendación: A** — reusa exactamente lo ya construido (`meta.json` + hook `SessionStart` + skill `praxis-config`) sin infraestructura nueva; B obliga a mantener un changelog de reglas por versión (fácil de olvidar y se desincroniza), y C sacrifica los buenos defaults para todos los proyectos. A deja la decisión en manos del usuario, que era el objetivo de la config interactiva.
- [ ] **Skill de auditoría de proyecto completo** — el plugin solo reacciona archivo por archivo cuando el agente edita (hook `PostToolUse`); no hay forma de auditar un proyecto YA existente de una pasada, así que las malas praxis en archivos que nadie tocó nunca salen a la luz. El directorio `.praxis-guard/` ya quedó listo como home para alojar esto. _(creado por: SmithDR · 2026-06-13)_
  - _Opción A:_ Skill `praxis-audit` que enumera los archivos en scope (según `include`/`exclude` de la config), corre `runDetector` sobre cada uno y consolida un reporte. Reusa el motor existente entero. Tradeoff: en repos grandes puede ser lento y ruidoso sin un mecanismo de batching (procesar en lotes para no saturar el contexto).
  - _Opción B:_ Un CLI determinista `bin/praxis-audit.mjs` que escupe el reporte (la skill solo lo invoca y lo presenta). Más testeable y CLI-agnóstico, menos conversacional.
  - _Opción C:_ Integrar `context-batching` del catálogo (fingerprints SHA256 + git diff) para auditar solo lo cambiado desde la última corrida. Más eficiente en repos grandes, pero más complejo y depende de otro feature.
  - **Recomendación: B+A** — el motor en `bin/praxis-audit.mjs` (determinista, testeable, reusa `runDetector`) con la skill `praxis-audit` como envoltorio conversacional, igual que el par `bin/praxis-config.mjs` + skill `praxis-config` que ya funciona; sumar C (fingerprints (huella SHA256 por archivo para saltear lo que no cambió)) recién cuando el tamaño del repo lo justifique.