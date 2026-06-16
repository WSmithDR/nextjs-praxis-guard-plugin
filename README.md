# nextjs-praxis-guard-plugin

Plugin multi-CLI para agentes de código que **avisa (sin bloquear)** sobre malas praxis en
proyectos Next.js. Tras cada edición de archivo que hace el agente, un linter determinístico
revisa el archivo recién escrito y, si encuentra problemas, inyecta un aviso `praxis-guard`
en el contexto del agente para que corrija en el flujo. Nunca rompe la edición.

## Reglas de contenido

| Regla | Qué detecta |
|-------|-------------|
| `secrets` | Keys, tokens y connection strings hardcodeados (Stripe, OpenAI, AWS, GitHub, Slack, Google, URLs con credenciales inline, y literales sensibles tipo `apiKey = "…"`). |
| `hardcoded-data` | Arrays grandes de datos de dominio embebidos en componentes `.tsx`/`.jsx` (listas de strings que deberían vivir en `config/`, `/lib` o la DB). El umbral por defecto es `minElements: 8`. |
| `forbidden-imports` | Imports de módulos vetados por el proyecto. La lista es **por-proyecto y está vacía por defecto**: vos definís qué no querés ver. |
| `file-responsibility` | Archivos demasiado largos (umbral de líneas) y un *nudge* de auto-reflexión cuando un mismo archivo mezcla *data fetching* con JSX (mezcla de responsabilidades). |
| `untranslated-text` | Texto literal **visible** en componentes `.tsx`/`.jsx` sin interpolar — nodos JSX (`<button>Enviar</button>`) y atributos de UI (`placeholder`, `title`, `alt`, `aria-label`, `label` como `attr="texto"`). Entorpece la i18n / soporte multidioma: el texto debería pasar por una función como `{t('clave')}`. Ignora lo interpolado (`{t(...)}`, `{variable}`, `attr={...}`). Configurable: `attributes`, `ignore`. Si tu proyecto no hace i18n, desactivala con `"enabled": false`. |

## Reglas de arquitectura (opt-in)

Todas vienen **`enabled: false`** y **no corren** hasta declarar `architecture.strategy`
(`by-feature` | `by-layer`) en la config. Así no tiran falsos positivos en proyectos con
layout no estándar.

| Regla | Clase | Qué detecta |
|-------|-------|-------------|
| `folder-placement` | por-archivo | Un tipo de archivo fuera de su carpeta permitida (mapping configurable `kind`→globs: hooks en `**/hooks/**`, server actions en `**/_actions/**`, …). |
| `layer-boundaries` | por-archivo | Imports que violan la dirección permitida entre capas (ej: `domain` no puede importar de `infra`/`ui`). |
| `server-client-boundaries` | por-archivo | Un client component (`'use client'`) que importa módulos server-only (`next/headers`, `node:*`, …). |
| `feature-deps` | por-archivo | Una feature que importa los **internos** de otra en vez de su API pública. |
| `architecture-coherence` | proyecto | Incoherencia global con la estrategia (ej: `by-feature` pero hay un `src/components/` global). Solo corre en la auditoría. |

## Reglas TypeScript (autodetect)

Corren solo si el proyecto tiene `tsconfig.json`. **No duplican ESLint/tsc** (no cazan `any`,
`@ts-ignore`, etc.): apuntan a las bondades de TS que se desaprovechan — reuso de tipos,
unions/enums, `as const`.

| Regla | Clase | Qué detecta |
|-------|-------|-------------|
| `repeated-object-shape` | por-archivo | El mismo shape de objeto literal repetido → extraé a `interface`/`type`. Config: `minProps`, `minRepeats`. |
| `stringly-typed` | por-archivo | Un valor comparado contra varios strings fijos → union type o `enum`. Config: `minLiterals`. |
| `duplicate-literal-union` | por-archivo | La misma union de literales escrita varias veces → nombrala una vez. Config: `minMembers`, `minRepeats`. |
| `prefer-as-const` | por-archivo | Objeto-mapa de constantes sin `as const` (perdés el narrowing). |
| `tsconfig-strictness` | proyecto | El `tsconfig` no fuerza el `baseline` de estrictez elegido (default `["strict","noImplicitAny"]`). Tiene fixer opt-in (abajo). |

## Reglas Tailwind (autodetect)

Corren solo si hay `tailwind.config.*`. Operan sobre el contenido de los `className`.

| Regla | Qué detecta |
|-------|-------------|
| `tailwind-arbitrary-values` | Valores arbitrarios `w-[473px]`, `text-[#3a3a3a]` que rompen el design system. Config: `allow`. |
| `tailwind-classname-bloat` | `className` con más de `maxClasses` clases (default 12) → extraé a componente o `cva`. |
| `tailwind-conditional-concat` | `className={'p-4 '+(x?'a':'')}` → usá `clsx`/`cn` (se rompe con el purge). |
| `tailwind-duplicate-utilities` | Clases duplicadas o contradictorias (`p-2 p-4`, `flex block`). |

### Fixer de tsconfig (opt-in)

`node bin/praxis-audit.mjs --fix-tsconfig --dir <proyecto>` aplica el `baseline` de
`tsconfig-strictness` a `compilerOptions`. Por seguridad, **solo escribe** si el `tsconfig.json`
es JSON limpio sin `extends`; si tiene comentarios o `extends`, no toca el archivo y te lista
los flags para agregar a mano. El flujo normal de `praxis-audit` nunca modifica `tsconfig.json`.

## Reglas custom por proyecto

Cada proyecto puede definir reglas propias en `.praxis-guard/rules/<id>.mjs` (committeables). El
nombre del archivo es el `id`. Mismo contrato que las built-in:

```js
// .praxis-guard/rules/no-console.mjs
export default function (content, filePath, config = {}, full = {}) {
  const out = [];
  content.split('\n').forEach((line, i) => {
    if (/\bconsole\.(log|debug)\(/.test(line))
      out.push({ rule: 'no-console', line: i + 1, severity: 'warn', message: 'console.* en producción.' });
  });
  return out;
}
// `meta` es opcional. El ejemplo de arriba es una file rule (default, sin meta).
// Para una project rule, declarala y usá la firma (projectTree, fullConfig):
//   export const meta = { kind: 'project' };
```

- **file rule** (default): `(content, filePath, ruleConfig, fullConfig) => Finding[]` — corre en el
  hook (en vivo) y en la auditoría.
- **project rule** (`meta.kind: 'project'`): `(projectTree, fullConfig) => Finding[]` — corre solo
  en la auditoría.
- Está activa por existir el archivo; se apaga/parametriza con `config.rules[<id>]`.
- Un id que choca con una regla built-in se ignora (gana el built-in). Un archivo roto se saltea
  con un aviso en la auditoría; nunca rompe el hook.
- Editar una regla custom dispara una auditoría completa (entra en el fingerprint).

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
node bin/install-hooks.mjs --target <proyecto> --cli <codex|copilot|opencode|precommit>
```

Dónde cae cada archivo en `<proyecto>`:

| CLI | Archivo instalado |
|-----|-------------------|
| `codex` | `.codex/hooks.json` |
| `copilot` | `.github/hooks/praxis-guard.json` |
| `opencode` | `.opencode/plugins/praxis-guard.mjs` |
| `precommit` | `.git/hooks/pre-commit` (corre `praxis-audit --staged`) |
| `github-action` | `.github/workflows/praxis-audit.yml` (audita el PR, sube SARIF) |

> **Caveat OpenCode:** por ahora los avisos se emiten al *log stream* de OpenCode
> (`client.app.log`). La re-inyección al contexto del agente **está sin verificar**.

### CI: GitHub Action (code scanning)

`node bin/install-hooks.mjs --cli github-action --target <proyecto>` escribe
`.github/workflows/praxis-audit.yml`. En cada Pull Request corre la auditoría **profunda**
(`--full --deep`), sube los findings como anotaciones inline (code scanning de GitHub) y **frena
el merge** si hay findings nuevos ≥ `commit.minSeverity` (default `warn`). Lleva el chequeo al
pipeline: pasa siempre, sin depender de quién tenga el plugin instalado.

El workflow clona el plugin a un **ref fijado** (`v<version>`, inyectado al instalar). Requisitos:

- El repo del plugin debe tener publicado ese **tag** (`vX.Y.Z`); si todavía no, cambiá el `--branch`
  del paso *clone* por `main`.
- El proyecto consumidor necesita un **lockfile** (`npm ci` instala las deps para que `typescript`
  resuelva en `--deep`).
- Repo del plugin **privado:** cambiá la URL del paso *clone* por
  `https://x-access-token:${{ secrets.PRAXIS_PLUGIN_TOKEN }}@github.com/<owner>/<repo>.git` y definí
  ese secret en el proyecto.

Para otros CI: `praxis-audit --format sarif` emite SARIF 2.1.0 a stdout (estándar neutral) y
`--gate` hace exit 1 según `commit.minSeverity`.

## Uso standalone

Podés correr el detector a mano sobre cualquier archivo. Imprime el bloque de avisos (o nada
si está limpio) y siempre sale con exit 0. Útil para CI o prueba manual.

```bash
node hooks/detect.mjs <archivo>
```

## Auditoría de proyecto completo

El hook reacciona archivo por archivo. Para auditar el repo **entero** (incluyendo archivos
que nadie tocó) está `bin/praxis-audit.mjs` — o la skill **`praxis-audit`** como envoltorio
conversacional. Decide solo el modo:

- **Completa** si cambió la versión del plugin o el `rules_fingerprint` (código/config de las
  reglas), o si nunca se auditó.
- **Incremental** (solo el `git diff` desde el último commit auditado) en caso contrario.

```bash
node bin/praxis-audit.mjs --dir <proyecto>          # auto (full o incremental)
node bin/praxis-audit.mjs --full --dir <proyecto>   # forzar completa
node bin/praxis-audit.mjs --since <ref> --dir <p>   # incremental desde un ref
node bin/praxis-audit.mjs --staged --dir <proyecto> # solo lo staged (pre-commit)
```

### Baseline (adopción en repos con deuda)

Correr el auditor en un repo grande existente puede tirar cientos de findings. Para adoptarlo sin
ruido, aceptá la deuda actual una vez:

```bash
node bin/praxis-audit.mjs --update-baseline --dir <proyecto>
```

Eso guarda las huellas de los findings actuales en `.praxis-guard/baseline.json` (committealo: es
deuda compartida). Desde ahí, `praxis-audit` por defecto **oculta** esos y muestra solo los
findings **nuevos**, con un contador `N ocultos por baseline`. La huella es `sha256(regla + archivo
+ mensaje)` — **sin** número de línea, así que sobrevive a que el código se mueva.

- `--no-baseline`: muestra todo, ignorando la baseline.
- Cuando arreglás findings baselined, sus huellas quedan huérfanas; un audit `--full` te avisa
  cuántas hay y `--update-baseline` re-snapshotea (limpia las resueltas).
- El pre-commit (`--staged`) respeta la baseline: no te bloquea por deuda ya aceptada, solo por
  findings nuevos.

El estado se guarda en `.praxis-guard/meta.json` (`last_audited_commit`, `rules_fingerprint`,
`plugin_version`, `reviewed_rules`). Si una versión del plugin agrega reglas nuevas, el hook
`SessionStart` te avisa de las que quedaron **sin revisar** y te sugiere correr `praxis-config`.

### Pre-commit

`node bin/install-hooks.mjs --target <proyecto> --cli precommit` instala un git `pre-commit`
que corre `praxis-audit --staged`. Por **default avisa sin bloquear**; para que aborte el
commit, poné en la config:

```json
{ "commit": { "block": true, "minSeverity": "warn" } }
```

(se saltea con `git commit --no-verify`).

## Configuración

La config base vive en `config/defaults.json`. Cada proyecto puede sobrescribirla con un
archivo propio, que se aplica por **deep-merge** sobre los defaults (solo declarás lo que
cambiás). La ubicación canónica es `.praxis-guard/config.json`; también se acepta
`nextjs-praxis-guard.json` en la raíz del proyecto (ruta CLI-agnóstica, aún soportada) y
`.claude/nextjs-praxis-guard.json` por compatibilidad con Claude Code.

La forma recomendada de armar o cambiar la config es la skill **`praxis-config`**: te
pregunta y la escribe en `.praxis-guard/config.json` (la ruta de máxima prioridad). En
Claude Code, si un proyecto Next.js no tiene config, el plugin te ofrece correr el setup
una vez (hook SessionStart). También podés editar el JSON a mano: el detector busca, en
orden, `.praxis-guard/config.json` → `nextjs-praxis-guard.json` (raíz) → `.config/...` →
`.claude/...`.

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

Para activar reglas de arquitectura, declarás la estrategia y configurás cada regla:

```json
{
  "architecture": {
    "strategy": "by-layer",
    "root": "src",
    "featuresDir": "src/features",
    "sharedDirs": ["src/shared", "src/lib"]
  },
  "rules": {
    "layer-boundaries": {
      "enabled": true,
      "layers": [
        { "name": "domain", "path": "src/domain", "mayImport": [] },
        { "name": "infra",  "path": "src/infra",  "mayImport": ["domain"] },
        { "name": "ui",     "path": "src/ui",     "mayImport": ["domain", "infra"] }
      ]
    },
    "folder-placement": {
      "enabled": true,
      "placement": [
        { "kind": "hook", "match": "^use[A-Z]", "allowed": ["**/hooks/**"] }
      ]
    }
  }
}
```

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

## Desarrollo: versionado automático

Un hook `post-commit` bumpea la versión de `.claude-plugin/plugin.json` en cada commit, según el
prefijo del mensaje (conventional commits) — y mete el cambio en el **mismo** commit (amend):

| Prefijo | Bump |
|---------|------|
| `feat:` | minor |
| `fix:` / `chore:` / `docs:` / `refactor:` / `test:` / `ci:` / … | patch |
| `feat!:` o `BREAKING CHANGE` | major |

Instalalo una vez (instala **solo** `post-commit`, no toca el `pre-commit` del todo-plugin):

```bash
bash bin/dev/setup.sh
```

Notas:
- Bumpea en **cada** commit (no por release). Si un commit ya toca `plugin.json` a mano, lo saltea.
- El guard de recursión (sentinel `.git/.version-bump-in-progress`) garantiza un único bump por commit
  aunque el `amend` re-dispare el hook.
- Flujo de release: commiteá con buen prefijo → la versión queda correcta → publicá el tag matching
  (`git tag vX.Y.Z && git push origin vX.Y.Z`), que es lo que el workflow de CI clona.
