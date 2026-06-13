# nextjs-praxis-guard-plugin — Diseño del MVP

**Fecha:** 2026-06-12
**Estado:** Diseño aprobado (brainstorming). Pendiente: plan de implementación.

## Qué es

Plugin **multi-CLI** (Claude Code, Copilot CLI, Gemini CLI, Codex) para agentes de
código que vigila las buenas praxis en proyectos **Next.js**. Engancha un hook
`PostToolUse` que revisa cada archivo que el agente escribe o edita y **avisa sin
bloquear** cuando detecta malas praxis.

Se construye sobre el meta-plugin **`cli-plugin-template`**, que da el scaffolding
y la compatibilidad multi-CLI (igual que los otros plugins del autor).

## Decisiones tomadas (brainstorming)

| Decisión | Elección | Razón |
|---|---|---|
| Alcance v1 | **MVP: solo hooks anti-malas-praxis** | Es el dolor real. Conocimiento/scaffolding/auditorías quedan para ciclos posteriores. |
| Mecanismo de detección | **Híbrido** | Determinístico para lo objetivo/barato; juicio para lo conceptual. |
| Cómo se hace el "juicio LLM" | **Enfoque A: señal determinística + auto-reflexión del agente** | Cero tokens extra. El script gatilla; el agente del loop juzga lo sutil. (Descartado: llamar a un modelo aparte / spawnear subagente → caro y lento por edición.) |
| Comportamiento al detectar | **Avisar, NO bloquear** | Menor fricción, evita trabas por falsos positivos. Inyecta `additionalContext`. |
| Ruleset v1 | **Las 4 reglas** (ver abajo) | |
| Runtime del detector | **Node `.mjs`, sin dependencias** | Portable, sin toolchain extra. AST con parser = mejora futura si molestan los falsos positivos. |
| Datos del plugin | **Genéricos + configurables por proyecto** | Nada de Eminat hardcodeado (sería repetir el pecado que se quiere cazar). |

## Arquitectura

```
nextjs-praxis-guard-plugin/
  (scaffolding multi-CLI generado por cli-plugin-template)
  hooks/
    hooks.json           ← registra PostToolUse sobre Write|Edit|MultiEdit
    detect.mjs           ← orquestador: lee archivo editado + config, corre reglas
  rules/                 ← una regla = un módulo aislado, interfaz común
    hardcoded-data.mjs       (fileContent, path, config) => Finding[]
    file-responsibility.mjs
    forbidden-imports.mjs
    secrets.mjs
  config/
    defaults.json        ← ruleset por defecto sensato para Next.js
  test/
    fixtures/            ← archivos buenos y malos por regla
    run.mjs              ← runner que verifica findings
  docs/specs/            ← este documento
  README.md
```

### Interfaz común de regla

Cada regla es un módulo aislado y testeable:

```
(fileContent: string, filePath: string, config: object) => Finding[]

Finding = {
  rule: string          // id de la regla
  line?: number         // línea aproximada
  message: string       // qué se detectó y sugerencia de fix
  severity: 'info' | 'warn'   // v1 nunca bloquea
}
```

## Las 4 reglas

1. **`hardcoded-data`** *(determinístico)* — arrays/objetos literales grandes de
   datos de dominio (nombres de personas, marcas, listas de opciones) dentro de
   componentes `.tsx`. Heurística: literal de N+ elementos con strings "de negocio".
   → "extraé a `config/`, constantes o DB".
2. **`file-responsibility`** *(híbrido, enfoque A)* — el script marca archivos sobre
   umbral (default **400** líneas) o que mezclan señales (fetch + JSX + lógica).
   Inyecta un nudge para que el agente evalúe la separación de responsabilidades.
3. **`forbidden-imports`** *(determinístico, configurable)* — lista por-proyecto.
   Ejemplos: "no `framer-motion` directo, usá tu wrapper", "no instanciar el cliente
   Supabase fuera del singleton". **Vacía por defecto**; cada proyecto la llena.
4. **`secrets`** *(determinístico)* — API keys, tokens, connection strings
   hardcodeados en vez de env vars.

## Configurabilidad

Config por-proyecto en `.claude/nextjs-praxis-guard.json` (y equivalentes por CLI
según lo que soporte `cli-plugin-template`):

- habilitar/deshabilitar cada regla
- ajustar umbrales (ej. líneas de `file-responsibility`)
- definir la lista de `forbidden-imports`

Trae defaults razonables y genéricos para Next.js.

## Data flow

```
agente edita archivo
  → PostToolUse dispara detect.mjs con el path
  → lee config del proyecto + contenido del archivo
  → corre reglas habilitadas
  → si hay findings: devuelve additionalContext con los avisos
  → el agente los ve y corrige en el flujo
```

## Manejo de errores

- El detector **nunca** rompe la edición: si algo falla → exit 0 en silencio.
- Timeout corto.
- Avisar nunca bloquea (decisión tomada).

## Testing

- Cada regla con **fixtures buenas y malas**.
- Runner (`test/run.mjs`) verifica que detecta lo que debe y **no** genera falsos
  positivos en las buenas.

## Fuera de alcance (v1)

- Skills de conocimiento/convenciones Next.js.
- Slash commands de scaffolding (`/new-module`, etc.).
- Auditorías on-demand (performance, a11y, SEO, bundle).
- Parsing AST (queda como mejora si los falsos positivos del regex molestan).
- Bloqueo de ediciones / severidad `error`.

Cada uno de estos será su propio ciclo spec → plan → implementación.