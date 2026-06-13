# nextjs-praxis-guard-plugin

Plugin multi-CLI para agentes de código que **avisa (sin bloquear)** sobre malas praxis en
proyectos Next.js. Tras cada edición de archivo que hace el agente, un linter determinístico
revisa el archivo recién escrito y, si encuentra problemas, inyecta un aviso `praxis-guard`
en el contexto del agente para que corrija en el flujo. Nunca rompe la edición.

## Las 5 reglas

| Regla | Qué detecta |
|-------|-------------|
| `secrets` | Keys, tokens y connection strings hardcodeados (Stripe, OpenAI, AWS, GitHub, Slack, Google, URLs con credenciales inline, y literales sensibles tipo `apiKey = "…"`). |
| `hardcoded-data` | Arrays grandes de datos de dominio embebidos en componentes `.tsx`/`.jsx` (listas de strings que deberían vivir en `config/`, `/lib` o la DB). El umbral por defecto es `minElements: 8`. |
| `forbidden-imports` | Imports de módulos vetados por el proyecto. La lista es **por-proyecto y está vacía por defecto**: vos definís qué no querés ver. |
| `file-responsibility` | Archivos demasiado largos (umbral de líneas) y un *nudge* de auto-reflexión cuando un mismo archivo mezcla *data fetching* con JSX (mezcla de responsabilidades). |
| `untranslated-text` | Texto literal **visible** en componentes `.tsx`/`.jsx` sin interpolar — nodos JSX (`<button>Enviar</button>`) y atributos de UI (`placeholder`, `title`, `alt`, `aria-label`, `label` como `attr="texto"`). Entorpece la i18n / soporte multidioma: el texto debería pasar por una función como `{t('clave')}`. Ignora lo interpolado (`{t(...)}`, `{variable}`, `attr={...}`). Configurable: `attributes`, `ignore`. Si tu proyecto no hace i18n, desactivala con `"enabled": false`. |

## Cómo funciona

1. Cada CLI dispara un hook **post-edición** después de que el agente escribe/edita un archivo.
2. El hook corre el detector compartido (`hooks/detect.mjs`) sobre el archivo afectado.
3. Si hay hallazgos, el adaptador (`hooks/hook-adapter.mjs`) inyecta un `additionalContext` con
   los avisos al agente.

No bloquea, no falla, **nunca rompe la edición** (siempre sale con exit 0). Si una regla
revienta, se ignora silenciosamente y el resto sigue corriendo.

## Instalación por CLI

### Claude Code
Automático. El plugin trae bundled `hooks/hooks.json` (hook `PostToolUse`). **Reiniciá la
sesión** para que Claude Code cargue los hooks.

### Gemini CLI
Automático. El plugin trae bundled la extensión `gemini-extension.json` (hook `AfterTool`) más
los hooks.

> **Caveat Gemini:** Gemini CLI migra a **Antigravity CLI el 2026-06-18**. Tras la transición,
> re-verificá el schema de hooks: el formato del manifest puede cambiar.

### Codex / Copilot / OpenCode
Estos CLIs no auto-cargan: instalalos apuntando a tu proyecto.

```bash
node bin/install-hooks.mjs --target <proyecto> --cli <codex|copilot|opencode>
```

Dónde cae cada archivo en `<proyecto>`:

| CLI | Archivo instalado |
|-----|-------------------|
| `codex` | `.codex/hooks.json` |
| `copilot` | `.github/hooks/praxis-guard.json` |
| `opencode` | `.opencode/plugins/praxis-guard.mjs` |

> **Caveat OpenCode:** por ahora los avisos se emiten al *log stream* de OpenCode
> (`client.app.log`). La re-inyección al contexto del agente **está sin verificar**.

## Uso standalone

Podés correr el detector a mano sobre cualquier archivo. Imprime el bloque de avisos (o nada
si está limpio) y siempre sale con exit 0. Útil para CI o prueba manual.

```bash
node hooks/detect.mjs <archivo>
```

## Configuración

La config base vive en `config/defaults.json`. Cada proyecto puede sobrescribirla con
`nextjs-praxis-guard.json` en la raíz del proyecto (ruta CLI-agnóstica, recomendada), que se
aplica por **deep-merge** sobre los defaults (solo declarás lo que cambiás). También se acepta
`.claude/nextjs-praxis-guard.json` por compatibilidad con Claude Code.

Ejemplo `nextjs-praxis-guard.json`:

```json
{
  "rules": {
    "file-responsibility": { "maxLines": 300 },
    "hardcoded-data": { "enabled": false },
    "forbidden-imports": {
      "list": [
        { "module": "lodash", "message": "Usá utilidades nativas o helpers de /lib en vez de lodash." },
        { "module": "moment", "message": "moment está deprecado: usá date-fns o Intl.DateTimeFormat." }
      ]
    }
  }
}
```

Eso baja el umbral de `file-responsibility` a 300 líneas, deshabilita `hardcoded-data` y veta
dos módulos en `forbidden-imports`.

## Cómo leer un aviso

Cuando el detector encuentra problemas, inyecta un bloque como este:

```
⚠️ praxis-guard — src/context/AppContext.tsx
  [warn] secrets:5 — Posible Stripe live secret key hardcodeado. Movelo a una env var (process.env.X) y a .env.local.
  [warn] hardcoded-data:3 — Array literal de 10 strings de dominio en un componente. Extraé a config/, una constante en /lib o la DB.
  [info] file-responsibility — Mezcla fetching de datos + JSX + lógica en un archivo de 612 líneas. ¿Conviene separar responsabilidades (data layer / presentación)? Reflexioná antes de seguir.
```

Cada línea es `[severity] regla[:línea] — mensaje` (el número de línea aparece cuando la
regla puede ubicar el problema; `file-responsibility` evalúa el archivo entero y lo omite).
`[warn]` señala algo a corregir; `[info]` es un *nudge* de auto-reflexión.

## Límites conocidos (v1)

La detección de v1 es **heurística basada en regex** (un detector basado en AST es una mejora
futura). Esto implica falsos negativos **conocidos y aceptados** — no son bugs:

- `forbidden-imports`: no detecta `import()` dinámico ni imports partidos en **múltiples líneas**.
- `hardcoded-data`: no cuenta arrays **anidados** (`[[...]]`).
- `secrets`: **saltea cualquier línea que contenga `process.env.`** (puede perderse un secreto en
  una línea que también tiene un fallback de env, p. ej. `KEY = process.env.X || "sk_live_…"`), y
  reporta como máximo **un secreto por línea**.
- `untranslated-text`: solo ve **nodos de texto JSX** (`>texto<`) y atributos con comilla doble
  (`attr="texto"`); no detecta texto mezclado con expresiones en el mismo nodo (`Hola {nombre}`),
  atributos con comilla simple, ni texto fuera de JSX. Es la regla más ruidosa: si no hacés i18n,
  desactivala.

## Tests

```bash
npm test
```
