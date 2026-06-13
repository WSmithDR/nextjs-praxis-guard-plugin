# nextjs-praxis-guard

Plugin multi-CLI que vigila buenas praxis en Next.js. Tras cada edición de archivo, un
linter determinístico revisa el archivo y, si encuentra problemas, te inyecta un aviso
`praxis-guard` (no bloquea). Reglas: `secrets`, `hardcoded-data`, `forbidden-imports`,
`file-responsibility`. Config por proyecto en `.claude/nextjs-praxis-guard.json`.

Si ves un aviso de `praxis-guard`, corregí el problema en el flujo antes de continuar.

## Soporte por CLI
- Claude Code: hook `PostToolUse` (bundled `hooks/hooks.json`).
- Gemini CLI: hook `AfterTool` (bundled). Ojo: transición a Antigravity CLI (2026-06-18).
- Codex CLI: hook `PostToolUse` (`cli/codex-hooks.json` → `.codex/`).
- Copilot CLI: hook `postToolUse` (`cli/copilot-hooks.json` → `.github/hooks/`).
- OpenCode: plugin `tool.execute.after` (`cli/opencode-plugin.mjs` → `.opencode/plugins/`).

Para Copilot/Codex/OpenCode: `node bin/install-hooks.mjs --target <project> --cli <name>`.
