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