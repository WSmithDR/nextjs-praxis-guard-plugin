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
| `single-component-per-file` | Más de un componente React declarado a nivel de módulo en un mismo archivo `.tsx`/`.jsx`. Convención: un componente por archivo (más fácil de testear, importar y reusar). Cuenta solo declaraciones top-level; subcomponentes anidados no cuentan. `ignore` (globs) exime archivos que co-locan varios a propósito (por default stories y tests). |
| `inline-mapped-component` | Un `.map()` que renderiza un bloque JSX no trivial inline (≥ `minTags` elementos, default `3`). Sugiere extraer un componente (`<Item/>`) y mapearlo. Mezclar iteración + markup grande inline cuesta testear y reusar. |
| `descriptive-component-names` | Un componente exportado con nombre genérico pelado (`Card`, `Item`, `Box`, `Wrapper`, `Data`, `Component`, `Thing`, `El`, `Comp`). Pide un nombre que describa el rol (`SectionCard`, `MemberCard`). `SectionCard` ya está ok (tiene prefijo de dominio). `blocklist` y `allow` configurables. |

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
| `thin-route-pages` | por-archivo | Un `app/**/page.tsx` con lógica de negocio (estado/hooks, muchas líneas, o JSX estructural) en vez de montar el componente público de la feature. Respeta route groups. Configurable: `maxLines`, `maxStructuralTags`. |
| `architecture-coherence` | proyecto | Incoherencia global con la estrategia (ej: `by-feature` pero hay un `src/components/` global). Solo corre en la auditoría. |
| `tailwind-content-coverage` | proyecto | El `content` de `tailwind.config` no cubre `featuresDir`/`sharedDirs`: al mover componentes ahí, Tailwind purga sus clases en silencio (build verde, página sin estilos). Sugiere el glob faltante. Solo corre en la auditoría. |

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

### Reglas TypeScript con AST (modo profundo `--deep`)

Usan el type-checker del proyecto (el `typescript` que ya tenés instalado) — por eso corren solo en
la auditoría profunda (`praxis-audit --deep`), nunca en el hook. Todas `info`.

| Regla | Qué detecta | Default |
|-------|-------------|---------|
| `type-duplicate-shape` | Un tipo que repite (o es superset de) otro en otro archivo → `Pick`/`Omit` o unificar. | on |
| `inline-shape-extract` | Forma de objeto inline que coincide con un `type` con nombre → referencialo. | on |
| `schema-type-redeclare` | Un `type` a mano que duplica un schema Zod → `z.infer<typeof X>`. | on |
| `prefer-satisfies` | `const x: T = {…}` que ensancha los literales → `{…} satisfies T`. | on |
| `as-const-opportunity` | Literal usado como fuente de union (`typeof X[number]`) sin `as const`. | on |
| `prefer-discriminated-union` | Union de objetos sin campo discriminante literal común. Config: `minMembers`. | **off** (experimental) |
| `prefer-branded-type` | Alias de primitivo con nombre de identidad (`*Id`/`*Token`/…) → branded type. Config: `pattern`. | **off** (experimental) |

Las experimentales se prenden a demanda en la config (`rules.<id>.enabled: true`).

### Literal mágico repetido (project rule)

| Regla | Clase | Qué detecta | Default |
|-------|-------|-------------|---------|
| `magic-literal-repeated` | proyecto | El mismo literal string/numérico repetido en **≥ `minFiles` archivos** distintos → extraé a una constante compartida. Config: `minFiles` (default 3), `minLen` (largo mínimo del literal, default 4). | on |

Corre en la **auditoría** (es project-level: necesita ver todo el repo), no en el hook por-archivo.

## Reglas Tailwind (autodetect)

Corren solo si hay `tailwind.config.*`. Operan sobre el contenido de los `className`.

| Regla | Qué detecta |
|-------|-------------|
| `tailwind-arbitrary-values` | Valores arbitrarios `w-[473px]`, `text-[#3a3a3a]` que rompen el design system. Config: `allow`. |
| `tailwind-classname-bloat` | `className` con más de `maxClasses` clases (default 12) → extraé a componente o `cva`. El aviso es project-aware: nombra `cva`/`tailwind-variants` si están en `package.json`, y ofrece `@apply` si el proyecto ya lo usa. |
| `tailwind-conditional-concat` | `className={'p-4 '+(x?'a':'')}` → usá `clsx`/`cn` (se rompe con el purge). |
| `tailwind-duplicate-utilities` | Clases duplicadas o contradictorias (`p-2 p-4`, `flex block`). |

### Theme-aware (AST, modo profundo `--deep`)

Parsean el `tailwind.config.*` **estáticamente** (sin ejecutarlo) y validan contra los tokens
**declarados por el proyecto** (`theme`/`theme.extend`; no los defaults built-in de Tailwind).
Cubren **v3** (config file) y **v4 CSS-only** (theme en `@theme` del CSS; Tailwind se detecta por
`tailwindcss` en `package.json` y el `@theme` se busca en los CSS convencionales como `app/globals.css`).

| Regla | Qué detecta | Default |
|-------|-------------|---------|
| `tailwind-arbitrary-has-token` | Valor arbitrario que coincide con un token tuyo: `bg-[#1a1a1a]` con `colors.brand='#1a1a1a'` → usá `bg-brand`. | on |
| `tailwind-off-theme-value` | Valor arbitrario de color/spacing que no está en tu theme. Ruidosa. | **off** (experimental) |

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

## Instalación

Hay **dos formas de obtener el plugin**, según el CLI: por el **marketplace de Claude Code**, o
**clonando el repo** para los demás CLIs.

### Claude Code (marketplace)

El repo es su propio marketplace (`.claude-plugin/marketplace.json`). Hay **dos formas de tipear los
comandos** según dónde estés:

- **Dentro de una sesión de Claude Code** (el REPL): `/plugin marketplace add …`
- **Desde la terminal** (bash): `claude plugin marketplace add …`

(Son el mismo comando; `/plugin` **no** funciona en bash y `claude plugin` no funciona dentro del REPL.)
Desde la terminal:

```bash
claude plugin marketplace add WSmithDR/nextjs-praxis-guard-plugin
claude plugin install nextjs-praxis-guard@nextjs-praxis-guard --scope project
```

`nextjs-praxis-guard@nextjs-praxis-guard` es `plugin@marketplace` (el repo aloja un único plugin con
el mismo nombre). `--scope project` lo instala para el proyecto donde estás parado (omitilo para
instalarlo a nivel usuario). **Reiniciá la sesión** tras instalar: el plugin trae bundled
`hooks/hooks.json` (`PostToolUse`), así que los hooks se cargan solos. Para quitarlo:
`claude plugin uninstall nextjs-praxis-guard`.

#### Actualizar el plugin (refrescar el cache)

El marketplace guarda un **clon local** del repo; `marketplace add` **no lo re-clona** si ya está en
disco. Cuando sale una versión nueva, refrescá el cache **antes** de reinstalar:

```bash
claude plugin marketplace update nextjs-praxis-guard   # re-clona desde main
claude plugin install nextjs-praxis-guard@nextjs-praxis-guard --scope project
```

Sin el `update`, seguís instalando la versión vieja del cache. (`remove` borra el marketplace;
`delete` no existe.)

> El marketplace clona la rama por default (`main`). Para fijar una versión, agregá el marketplace
> desde un fork/tag o desde un checkout local con `claude plugin marketplace add <ruta>`.

### Otros CLIs (clonar el repo)

Codex, Copilot, OpenCode y el git pre-commit **no** usan el marketplace de Claude Code: cloná el repo
una vez y corré el instalador apuntando a tu proyecto.

```bash
git clone https://github.com/WSmithDR/nextjs-praxis-guard-plugin.git
cd nextjs-praxis-guard-plugin
npm install   # deps del plugin (incluye su typescript para las reglas AST)
node bin/install-hooks.mjs --target <ruta-a-tu-proyecto> --cli <codex|copilot|opencode|precommit|github-action>
```

Gemini CLI usa su propio formato de extensión (`gemini-extension.json`, bundled): se instala como
extensión de Gemini, no por este script. Ver abajo.

## Hooks por CLI

Una vez obtenido el plugin (arriba), así se **activa el hook** en cada CLI:

### Claude Code
Automático tras instalar el plugin. El hook `PostToolUse` viene en `hooks/hooks.json`. **Reiniciá la
sesión** para que Claude Code lo cargue.

### Gemini CLI
Automático al instalar la extensión. El plugin trae bundled `gemini-extension.json` (hook `AfterTool`)
más los hooks.

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

### Actualizar la versión del plugin en CI

El workflow clona el plugin a un **tag fijado** (`v<version>`) que quedó escrito en
`.github/workflows/praxis-audit.yml` **del proyecto consumidor** al instalarlo. Ese tag **no se
actualiza solo**: cuando sale una versión nueva del plugin, el CI sigue usando la vieja hasta que
vos lo subas (es a propósito — CI reproducible). Para actualizarlo, en el **proyecto consumidor**:

**Opción A — re-correr el instalador (recomendada).** Primero actualizá tu copia local del plugin a
la versión que querés fijar (el instalador lee la `version` de esa copia), después:

```bash
node <ruta-al-plugin>/bin/install-hooks.mjs --cli github-action --target <proyecto>
```

Regenera `praxis-audit.yml` con el tag = la versión del plugin instalado.

**Opción B — a mano.** Editá la línea del clone en `.github/workflows/praxis-audit.yml`:

```yaml
run: git clone --depth 1 --branch v0.24.4 <url> "$RUNNER_TEMP/praxis-plugin"
#                                  ^^^^^^^ cambialo al tag nuevo
```

En ambos casos, lo que lo hace efectivo es commitear el workflow en el proyecto consumidor; el
**próximo PR** ya corre con el tag nuevo:

```bash
git add .github/workflows/praxis-audit.yml
git commit -m "ci: bump praxis-guard a vX.Y.Z"
git push
```

> El tag debe **existir en el remoto del plugin** (`git tag vX.Y.Z && git push origin vX.Y.Z` en el
> repo del plugin). Si fijás un tag inexistente, el `git clone --branch` del CI falla. Como el autobump
> sube la versión por commit pero **no** crea tags, acordate de publicar el tag en cada release.

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
        { "module": "moment", "message": "moment está deprecado: usá date-fns o Intl.DateTimeFormat." },
        { "module": "framer-motion", "allowDirs": ["lib/motion"], "message": "Importá framer-motion solo desde tu wrapper en lib/motion." }
      ]
    }
  }
}
```

Eso baja el umbral de `file-responsibility` a 300 líneas, deshabilita `hardcoded-data` y veta
dos módulos en `forbidden-imports`. El tercero usa `allowDirs`: `framer-motion` solo se permite
desde `lib/motion` (boundary by-feature) — importarlo desde otra carpeta se marca.

Para tolerar tamaños distintos por carpeta, `file-responsibility` acepta `overrides` (umbral por glob):

```json
{ "rules": { "file-responsibility": { "maxLines": 200, "overrides": [
  { "glob": "**/lib/**", "maxLines": 80 },
  { "glob": "app/**/route.ts", "maxLines": 120 }
] } } }
```

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

`folder-placement` entiende el App Router de Next: `app/**` matchea route groups `(group)`,
parallel routes `@slot`, y dynamic `[slug]`/`[...all]`. Como los route groups son transparentes
a la URL, un `allowed` canónico como `app/about/**` también acepta `app/(marketing)/about/page.tsx`
(el segmento `(marketing)` se colapsa antes de matchear).

**Qué archivos se auditan.** Dos filtros recortan el universo: `exclude` (por **nombre de directorio**:
código tuyo que no querés auditar, p. ej. dirs de otros plugins) y `respectGitignore` (los archivos que
**git ignora**: build, deps, secretos). La skill `praxis-config` te pregunta por ambos — ofrece activar
el respeto al `.gitignore` y un checklist de directorios candidatos a excluir (más texto libre).

### Referencia de valores

Cada regla acepta `"enabled": true|false`. Las que tienen parámetros:

| Regla | Parámetro | Tipo / valores | Default |
|-------|-----------|----------------|---------|
| `hardcoded-data` | `minElements` | entero (tamaño mínimo del array para avisar) | `8` |
| `forbidden-imports` | `list` | array de `{ "module": string, "message"?: string, "allowDirs"?: string[] }` | `[]` |
| `file-responsibility` | `maxLines` | entero (líneas para "archivo muy largo") | `400` |
| | `mixedSignalsLines` | entero (umbral del nudge fetching+JSX) | `200` |
| | `overrides` | array de `{ "glob", "maxLines"?, "mixedSignalsLines"? }` (umbral por glob; último match gana) | `[]` |
| `untranslated-text` | `attributes` | array de nombres de atributo a vigilar | `["placeholder","title","alt","aria-label","label"]` |
| | `ignore` | array de strings/regex a ignorar | `[]` |
| `single-component-per-file` | `ignore` | array de globs exentos (co-location legítima) | `["**/*.stories.tsx","**/*.stories.jsx","**/*.test.tsx","**/*.test.jsx","**/*.spec.tsx","**/*.spec.jsx"]` |
| `inline-mapped-component` | `minTags` | entero (tags JSX mínimos en el `.map` para sugerir extraer) | `3` |
| `descriptive-component-names` | `blocklist` / `allow` | arrays de nombres vagos a marcar / excepciones | `["Card","Item","Box","Wrapper","Data","Component","Thing","El","Comp"]` / `[]` |
| `thin-route-pages` | `maxLines` / `maxStructuralTags` | enteros (umbral de líneas / tags HTML antes de avisar) | `30` / `2` |
| `folder-placement` | `placement` | array de `{ "kind", "match" (regex), "allowed" (globs) }` | `[]` |
| `layer-boundaries` | `layers` | array de `{ "name", "path", "mayImport": string[] }` | `[]` |
| `server-client-boundaries` | `serverOnly` | array de módulos server-only | `["server-only","next/headers","fs","node:fs",…]` |
| `feature-deps` | `publicEntry` | array de nombres de entrypoint público | `["index.ts","index.tsx"]` |
| `repeated-object-shape` | `minProps` / `minRepeats` | enteros | `2` / `2` |
| `stringly-typed` | `minLiterals` | entero | `2` |
| `duplicate-literal-union` | `minMembers` / `minRepeats` | enteros | `2` / `2` |
| `tsconfig-strictness` | `baseline` | array de flags de `compilerOptions` | `["strict","noImplicitAny"]` |
| `tailwind-arbitrary-values` | `allow` | array de valores arbitrarios permitidos | `[]` |
| `tailwind-classname-bloat` | `maxClasses` | entero | `12` |
| `type-duplicate-shape` · `inline-shape-extract` · `schema-type-redeclare` | `minProps` | entero | `2` |
| `magic-literal-repeated` | `minFiles` / `minLen` | enteros | `3` / `4` |
| `prefer-satisfies` | `minProps` | entero | `1` |
| `prefer-discriminated-union` | `minMembers` | entero | `2` |
| `prefer-branded-type` | `pattern` | regex (sufijos de identidad) | `"(Id\|Token\|Key\|Uuid\|Hash)$"` |

Knobs **globales** (fuera de `rules`):

| Clave | Valores | Default |
|-------|---------|---------|
| `include` | array de extensiones que el linter mira | `[".ts",".tsx",".js",".jsx",".mjs",".cjs"]` |
| `exclude` | array de carpetas a saltear | `["node_modules/",".next/","dist/","build/",".git/","coverage/"]` |
| `respectGitignore` | `true\|false` — no audita los archivos que git ignora (hook + auditor; fail-open si no es repo git) | `false` |
| `architecture.strategy` | `null` · `"by-feature"` · `"by-layer"` (gate de las reglas de arquitectura) | `null` |
| `architecture.root` / `featuresDir` / `sharedDirs` | rutas del proyecto | `"src"` / `"src/features"` / `["src/shared","src/lib"]` |
| `commit.block` | `true\|false` (si el pre-commit aborta) | `false` |
| `commit.minSeverity` | `"info"` · `"warn"` · `"error"` (umbral del gate / pre-commit) | `"warn"` |

Knob **transversal** (en reglas AST): `"runOn"` acepta `"deep"` (default — corre solo en
`praxis-audit --deep`) o `"full"` (corre también en la auditoría **completa** / CI, no solo a mano).
Ej: `"type-duplicate-shape": { "runOn": "full" }`.

### Cambiar la config y que se aplique

**Cómo cambiarla** — dos vías:
1. **Skill `praxis-config`** (recomendada): te pregunta qué reglas correr y con qué parámetros, y
   escribe `.praxis-guard/config.json` por vos. En cualquier CLI con skills, invocala con
   *"configurá praxis-guard"*.
2. **A mano:** editás `.praxis-guard/config.json` (solo declarás lo que cambiás; deep-merge sobre
   los defaults). Validá que sea JSON válido.

**Cómo se re-lee** — el detector carga la config **fresca en cada corrida** (no la cachea):

- **Hook por-archivo:** el cambio aplica en la **próxima edición**. No hace falta reiniciar la sesión
  para cambios de **valores**. (Solo *instalar/quitar el hook* en sí —no sus valores— requiere
  reiniciar la sesión en Claude Code, porque el CLI carga `hooks.json` al arrancar.)
- **Auditoría (`praxis-audit`):** la próxima corrida ya usa los valores nuevos. Además, cambiar la
  config de reglas mueve el `rules_fingerprint` en `.praxis-guard/meta.json`, así que el auditor
  pasa solo a modo **completo** la próxima vez (re-evalúa todo el repo con los valores nuevos).

No hay paso de "recargar" manual: guardás el JSON y el siguiente evento (edición o auditoría) ya lo aplica.

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

## Ciclo de vida de un finding (cómo se cierra)

Cada superficie que recolecta hallazgos tiene su forma de marcarlos **resueltos** — ninguna acumula
pendientes sin cierre:

| Superficie | Cómo se cierra | Auto / manual |
|-----------|----------------|---------------|
| **Hook por-archivo** | Recomputa en cada edición: arreglás el código → el aviso no vuelve a aparecer. No guarda estado. | **Auto** (auto-sana) |
| **Auditoría** (`praxis-audit`) | Recomputa en cada corrida: el finding desaparece solo cuando lo arreglás. | **Auto** |
| **Pre-commit** | Recomputa por commit (respeta la baseline). | **Auto** |
| **Baseline** (`baseline.json`, deuda aceptada) | El audit detecta las huellas que ya no aparecen (`resolvedCount`) y avisa *"N findings ya están resueltos — corré `--update-baseline`"*; ese comando las purga. | Detección **auto** + purga **manual** (es estado committeado del equipo) |
| **Reglas sin revisar** (`meta.json` → `reviewed_rules`) | `SessionStart` nudgea las reglas registradas que no estén en `reviewed_rules`; correr **`praxis-config`** las marca todas revisadas → el nudge se apaga. | Detección **auto** + cierre al correr `praxis-config` |
| **SARIF → GitHub code scanning** | GitHub auto-cierra la alerta cuando el finding desaparece del siguiente scan del PR. | **Auto** (lo maneja GitHub) |

Las superficies **efímeras** (hook, audit, pre-commit) no guardan ledger: "resuelto" = el problema deja
de detectarse. Las **persistentes** (baseline, `reviewed_rules`) detectan la resolución solas y te la
muestran, pero el paso de finalizar es **manual a propósito** porque son estado committeado: no se
reescriben sin que vos lo decidas.

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

## Generación de tests (opt-in)

La skill **`praxis-gen-tests`** genera el archivo de test de arranque de un componente/archivo. El
motor determinista detecta framework, ruta y firma; el agente escribe los casos reales sobre ese plan
y **nunca pisa** un test existente.

```bash
# motor (devuelve el PLAN en JSON):
node bin/gen-tests.mjs <archivo> --dir <proyecto>
```

Detecta `vitest` / `jest` / `node:test` (por `package.json`/configs), usa `@testing-library/react` si
está, calcula la ruta (`__tests__/` o co-located `*.test.tsx`), y extrae export + props del componente.

## Componentes para unificar (opt-in)

La skill **`praxis-similar-components`** detecta componentes React parecidos/duplicados entre archivos
(candidatos a unificar en uno compartido) y **sugiere** la unificación — no refactoriza. Es el
equivalente "a nivel componente" de `type-duplicate-shape`.

```bash
# motor (devuelve los grupos en JSON):
node bin/similar-components.mjs --dir <proyecto> [--threshold 0.85] [--min-elements 3]
```

Arma una firma estructural de cada componente (multiset de tipos de elemento JSX + hooks), compara por
similitud Jaccard ponderada entre archivos distintos y agrupa los que pasan el umbral (union-find).
Subí `--threshold` si hay ruido; bajalo para casos más laxos.

## Desarrollo: versionado automático

Un hook `post-commit` bumpea la versión en cada commit, según el prefijo del mensaje
(conventional commits), y mete el cambio en el **mismo** commit (amend). La fuente de verdad es
`.claude-plugin/plugin.json`; el bump delega en `bin/bump-version.py`, que **sincroniza todos los
manifiestos por-CLI** (`.codex-plugin/plugin.json`, `.copilot-plugin/plugin.json`,
`gemini-extension.json`) para que ninguno quede desfasado:

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
- `bin/bump-version.py` también sirve standalone: `--sync` propaga la versión canónica sin bumpear,
  `--check` detecta drift entre manifiestos (útil en CI), `--set X.Y.Z` fija una versión exacta.
- Flujo de release: commiteá con buen prefijo → la versión queda correcta → publicá el tag matching
  (`git tag vX.Y.Z && git push origin vX.Y.Z`), que es lo que el workflow de CI clona.
