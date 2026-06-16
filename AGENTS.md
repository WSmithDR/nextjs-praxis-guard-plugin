# nextjs-praxis-guard

Plugin multi-CLI que vigila buenas praxis en Next.js. Tras cada edición de archivo, un
linter determinístico revisa el archivo y, si encuentra problemas, te inyecta un aviso
`praxis-guard` (no bloquea). Reglas de contenido: `secrets`, `hardcoded-data`,
`forbidden-imports`, `file-responsibility`, `untranslated-text`. Reglas de arquitectura
(opt-in, requieren declarar `architecture.strategy`): `folder-placement`, `layer-boundaries`,
`server-client-boundaries`, `feature-deps` (por-archivo) y `architecture-coherence` (solo
auditoría). Reglas TypeScript (autodetect si hay `tsconfig.json`; aprovechamiento de tipos, no
duplican ESLint): `repeated-object-shape`, `stringly-typed`, `duplicate-literal-union`,
`prefer-as-const` (por-archivo) y `tsconfig-strictness` (auditoría, con fixer
`praxis-audit --fix-tsconfig`). Reglas Tailwind (autodetect si hay `tailwind.config.*`):
`tailwind-arbitrary-values`, `tailwind-classname-bloat`, `tailwind-conditional-concat`,
`tailwind-duplicate-utilities`. Config por proyecto en `nextjs-praxis-guard.json` (raíz,
CLI-agnóstica), con `.claude/nextjs-praxis-guard.json` como fallback.

Si ves un aviso de `praxis-guard`, corregí el problema en el flujo antes de continuar.

## Soporte por CLI
- Claude Code: hook `PostToolUse` (bundled `hooks/hooks.json`).
- Gemini CLI: hook `AfterTool` (bundled). Ojo: transición a Antigravity CLI (2026-06-18).
- Codex CLI: hook `PostToolUse` (`cli/codex-hooks.json` → `.codex/`).
- Copilot CLI: hook `postToolUse` (`cli/copilot-hooks.json` → `.github/hooks/`).
- OpenCode: plugin `tool.execute.after` (`cli/opencode-plugin.mjs` → `.opencode/plugins/`).

Para Copilot/Codex/OpenCode: `node bin/install-hooks.mjs --target <project> --cli <name>`.
Para el git pre-commit: `--cli precommit` (corre `praxis-audit --staged`).

## Auditoría de proyecto

Además del hook por-archivo, `praxis-audit` audita el repo completo. Invocá la skill
**`praxis-audit`** (o `node bin/praxis-audit.mjs`). Decide sola:
- versión del plugin o código/config de reglas cambió → auditoría **completa**;
- si no → **incremental** sobre el git diff desde el último commit auditado.

El estado vive en `.praxis-guard/meta.json` (`last_audited_commit`, `rules_fingerprint`,
`plugin_version`, `reviewed_rules`). Si aparecen reglas sin revisar, el hook `SessionStart`
te ofrece correr `praxis-config`. El pre-commit por default **avisa sin bloquear**; activá
el bloqueo con `"commit": { "block": true, "minSeverity": "warn" }`.

Para adoptar el auditor en un repo con deuda existente: `praxis-audit --update-baseline` acepta
los findings actuales en `.praxis-guard/baseline.json` (committealo); desde ahí solo verás los
**nuevos**. `--no-baseline` muestra todo. El pre-commit también respeta la baseline (no bloquea
por deuda ya aceptada, solo por findings nuevos).

## Configuración por proyecto

La config vive en `.praxis-guard/config.json` (committeala — es config de equipo). Para
armarla o cambiarla de forma guiada, invocá la skill **`praxis-config`**: te pregunta qué
reglas correr y con qué parámetros, y la escribe por vos (vía `bin/praxis-config.mjs`).
En Claude Code, si un proyecto Next.js no tiene config, el hook SessionStart te lo ofrece
una vez. En las otras CLIs, corré `praxis-config` a demanda.
