# Reglas TypeScript (aprovechamiento de tipos) + Tailwind — Fase 1

> Diseño aprobado — 2026-06-15. Extiende el plugin con dos grupos de reglas nuevos,
> heurísticos (regex, zero-dep) y con **autodetección de stack**.

## Objetivo

Dos grupos de reglas nuevos:

1. **`typescript`** — NO duplicar lo que ESLint/tsc ya marcan (`any`, `@ts-ignore`,
   non-null, etc.). En cambio, detectar **bondades de TS desaprovechadas**: reuso de
   tipos/interfaces, unions/enums donde hoy hay strings sueltos, `as const`, y la raíz
   del problema (un `tsconfig` no estricto).
2. **`tailwind`** — buenas praxis de Tailwind, solo si el proyecto usa Tailwind.

Ambos grupos se **autodetectan** y corren sin configuración en el caso común; el dev puede
apagar reglas o ajustar params con `praxis-config`.

## No-objetivos (YAGNI / honestidad técnica)

- **Derivación de tipos cross-file** (`este tipo es un `Pick<Otro>``): requiere el
  type-checker de TS (AST). Queda como **Fase 2** (modo `--ast`, dep `typescript`),
  fuera de este spec.
- **Reglas que pisan ESLint/tsc** (`no-explicit-any`, `no-ts-ignore`, `non-null-assertion`,
  `prefer-type-imports`): descartadas a propósito — el linter ya las cubre.
- **Leer el theme de `tailwind.config`** para validar contra la paleta exacta: futuro.
  La Fase 1 marca patrones (arbitrary values, bloat) sin parsear el theme.

---

## A. Detección de stack (plumbing)

### A.1 `lib/detect-stack.mjs`
Función `detectStack(rootDir) => { typescript, tailwind, tsconfigPath, tsconfigOptions, tsconfigFixable }`:

- `typescript`: `true` si existe `<root>/tsconfig.json`.
- `tailwind`: `true` si existe `<root>/tailwind.config.{js,cjs,mjs,ts}`.
- `tsconfigPath`: ruta absoluta del tsconfig (o null).
- `tsconfigOptions`: objeto `compilerOptions` parseado, o `null` si no se pudo leer.
  Parseo tolerante: intenta `JSON.parse`; si falla, strip de comentarios `//` y `/* */`
  y reintenta. Si igual falla → `null` (las reglas que dependen de él degradan a no-op).
- `tsconfigFixable`: `true` solo si el tsconfig es **JSON limpio** (sin comentarios) y
  **sin `extends`** — condición para que el fixer pueda escribirlo sin clobberear nada.

### A.2 Inyección en los orquestadores
Las file rules siguen siendo puras: `(content, filePath, ruleConfig, fullConfig)`. La
detección se calcula una vez y se mete en `fullConfig.detected`:

- `hooks/detect.mjs` (`runDetector`): calcula `detectStack(process.cwd())` y lo asigna a
  `cfg.detected` antes del loop de reglas. Costo: unos `existsSync` — despreciable.
- `bin/praxis-audit.mjs`: calcula `detectStack(dir)` una vez y lo asigna a `config.detected`.

> `config.detected` es estado **interno** (no lo escribe el usuario). `validateConfig` NO lo
> valida ni lo espera en la config de proyecto.

### A.3 Gating de cada grupo
Una regla del grupo no corre si su stack no está detectado o si la extensión no aplica:

- Reglas **TS** → requieren `fullConfig.detected?.typescript` y archivo `.ts`/`.tsx`.
- Reglas **Tailwind** → requieren `fullConfig.detected?.tailwind` y archivo `.tsx`/`.jsx`.
- Además respetan `ruleConfig.enabled === false` (apagado explícito por el dev).

En `config/defaults.json` todas entran `enabled: true` (el gating real es la detección).
El `rules_fingerprint` ya hashea el código fuente de cada regla → el drift las detecta como
reglas nuevas y `SessionStart` ofrece `praxis-config`.

---

## B. Grupo `typescript`

### B.1 `repeated-object-shape` (file rule) — *reuso de tipos*
Detecta el mismo **shape de objeto literal** repetido en el archivo (en anotaciones de tipo
o type aliases inline) y sugiere extraerlo a una `interface`/`type`.

- Heurística: extrae bloques `{ k1: T1; k2: T2; … }` que aparecen como tipo (después de `:`
  en params/vars o en `type X = {…}`), **normaliza** (ordena claves, colapsa espacios) y
  hashea. Si un mismo hash aparece `≥ minRepeats` veces y tiene `≥ minProps` props → finding.
- Config: `{ enabled, minProps: 2, minRepeats: 2 }`. Severidad `info`.
- Mensaje: `Shape de objeto repetido N veces. Extraé a una interface/type reutilizable.`

### B.2 `stringly-typed` (file rule) — *unions / enums*
Un valor comparado contra un **set fijo de string literals** sugiere un union type o enum.

- Heurística: por línea/bloque, detecta cadenas de comparación del mismo identificador
  contra literales: `x === 'a' || x === 'b'` (o `switch (x) { case 'a': case 'b': }`).
  Si hay `≥ minLiterals` literales distintos comparados contra el mismo identificador →
  finding sobre la primera línea.
- Config: `{ enabled, minLiterals: 2 }`. Severidad `info`.
- Mensaje: `"<id>" se compara contra varios strings fijos. Considerá un union type ('a' | 'b') o un enum.`

### B.3 `duplicate-literal-union` (file rule) — *reuso de tipos*
La misma **union de literales** escrita más de una vez → nombrala.

- Heurística: extrae uniones de literales `'a' | 'b' | 'c'` (o numéricas) de las anotaciones,
  normaliza (ordena miembros) y hashea. Si una union con `≥ minMembers` aparece `≥ minRepeats`
  veces → finding.
- Config: `{ enabled, minMembers: 2, minRepeats: 2 }`. Severidad `info`.
- Mensaje: `Union de literales repetida. Declarala una vez como type y reusala.`

### B.4 `prefer-as-const` (file rule) — *const assertions*
Un objeto-mapa de constantes usado como enum, sin `as const`, pierde el narrowing.

- Heurística: `const NAME = { K1: 'v1', K2: 'v2', … } ;` (objeto literal con solo valores
  primitivos, nombre en MAYÚSCULAS o `PascalCase`) que **no** termina en `as const` → finding.
- Config: `{ enabled }`. Severidad `info`.
- Mensaje: `Objeto de constantes sin "as const": perdés el narrowing de tipos. Agregá "as const".`

### B.5 `tsconfig-strictness` (project rule, + fixer) — *la raíz*
Corre **solo en la auditoría** (project rule). Lee `fullConfig.detected.tsconfigOptions` y
compara contra un **baseline elegido por el dev**.

- Config: `{ enabled, baseline: ["strict", "noImplicitAny"] }` (default). El dev agrega los
  que quiera (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …).
- Por cada flag del baseline que falte o esté en `false` en `compilerOptions` → finding `warn`
  con `file: "tsconfig.json"`.
- Si `detected.typescript` es false, no hay tsconfig, o `tsconfigOptions` es null → no corre.
- Mensaje: `tsconfig no fuerza "<flag>". Activalo para que el linter pueda cazar estos problemas.`

#### Fixer opt-in
- Flag nuevo: `node bin/praxis-audit.mjs --fix-tsconfig --dir <proyecto>`.
- Calcula los flags faltantes del baseline y los escribe en `compilerOptions` (merge mínimo:
  solo agrega/sube a `true` lo que falta; no toca nada más). Escritura atómica. Imprime el diff.
- **Gate de seguridad:** solo escribe si `detected.tsconfigFixable` (JSON limpio, sin `extends`).
  Si no es fixable (JSONC/comentarios/`extends`) → **NO escribe**, avisa, y lista los flags a
  agregar a mano. Mantiene la regla de oro "no rompe tu archivo".
- Es la **única** vía de modificación. `praxis-audit` sin el flag jamás toca `tsconfig.json`.

---

## C. Grupo `tailwind` (file rules)

Todas requieren `detected.tailwind` y archivo `.tsx`/`.jsx`. Operan sobre el contenido de los
atributos `className="…"` / `className={'…'}` (regex que extrae el string de clases).

### C.1 `tailwind-arbitrary-values`
Marca valores arbitrarios `w-[473px]`, `text-[#3a3a3a]`, `top-[13px]` (utilities con `-[…]`)
que rompen el design system. Config: `{ enabled, allow: [] }` (lista de utilities/prefijos
permitidos, ej. `["grid-cols-"]`). Severidad `info`.

### C.2 `tailwind-classname-bloat`
`className` con más de `maxClasses` clases → sugerir extraer a componente o `cva`/`tailwind-variants`.
Config: `{ enabled, maxClasses: 12 }`. Severidad `info`.

### C.3 `tailwind-conditional-concat`
Concatenación de strings de clases con ternarios/`+` (`className={'p-4 ' + (x ? 'a' : '')}`)
→ usar `clsx`/`cn` (la concatenación manual se rompe con el purge). Config: `{ enabled }`.
Severidad `warn`.

### C.4 `tailwind-duplicate-utilities`
Clases duplicadas o contradictorias en el mismo `className` (`p-2 p-4`, `flex block`,
`block hidden`). Heurística: agrupa por "familia" de utility (prefijo) y marca repetidos.
Config: `{ enabled }`. Severidad `warn`.

---

## D. Componentes a tocar / crear

| Archivo | Cambio |
|---|---|
| `lib/detect-stack.mjs` | **nuevo** — detección de stack + parseo tolerante de tsconfig |
| `rules/repeated-object-shape.mjs` | **nuevo** (file) |
| `rules/stringly-typed.mjs` | **nuevo** (file) |
| `rules/duplicate-literal-union.mjs` | **nuevo** (file) |
| `rules/prefer-as-const.mjs` | **nuevo** (file) |
| `rules/tsconfig-strictness.mjs` | **nuevo** (project) |
| `rules/tailwind-arbitrary-values.mjs` | **nuevo** (file) |
| `rules/tailwind-classname-bloat.mjs` | **nuevo** (file) |
| `rules/tailwind-conditional-concat.mjs` | **nuevo** (file) |
| `rules/tailwind-duplicate-utilities.mjs` | **nuevo** (file) |
| `lib/tsconfig-fix.mjs` | **nuevo** — calcula y aplica flags faltantes (usado por el fixer) |
| `rules/index.mjs` | registrar 8 file rules + 1 project rule |
| `hooks/detect.mjs` | inyectar `cfg.detected` (detectStack del cwd) |
| `bin/praxis-audit.mjs` | inyectar `config.detected` + flag `--fix-tsconfig` |
| `lib/validate-config.mjs` | + ids nuevos en `KNOWN_RULES` + validación de params y `baseline` |
| `config/defaults.json` | + las 9 reglas (enabled, gated por detección) |
| `skills/praxis-config/SKILL.md`, `skills/praxis-audit/SKILL.md` | documentar grupos + `--fix-tsconfig` |
| `AGENTS.md` (CLAUDE.md symlink), `README.md` | documentar |
| `test/` | fixtures buenas/malas por regla + detect-stack + fixer |

## E. Testing

- **Cada regla**: fixture buena + mala (mismo patrón del repo: test `.mjs` con `assert/strict`).
- **`detect-stack`**: con/sin `tsconfig.json`; con/sin `tailwind.config.*`; tsconfig JSONC →
  `tsconfigOptions` parseado pero `tsconfigFixable: false`; tsconfig inválido → `tsconfigOptions: null`.
- **Gating**: regla TS sobre `.js` → 0 findings; regla Tailwind con `detected.tailwind: false` → 0.
- **`tsconfig-strictness`**: baseline cubierto → 0; flag faltante o `false` → finding por flag.
- **Fixer**: JSON limpio sin `extends` → escribe los flags faltantes (verificar contenido);
  JSONC o con `extends` → no escribe, exit 0, lista los flags.

## F. Riesgos

- **Falsos positivos** de las heurísticas TS (shapes/uniones) en código con formato raro →
  mitigado por normalización + umbrales (`minRepeats`/`minProps`) y severidad `info`.
- **Ruido de Tailwind** en proyectos que usan arbitrary values a propósito → `allow` list y
  severidad `info`; el grupo es opt-out por regla.
- **Fixer y `tsconfig` con `extends`/JSONC**: explícitamente NO se escribe (se avisa). Cero
  riesgo de clobber.
- **Solapamiento con ESLint**: evitado por diseño (las reglas lint-style quedaron fuera).
