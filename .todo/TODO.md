# TODO — nextjs-praxis-guard-plugin

> MVP: hook `PostToolUse` que detecta malas praxis en Next.js y **avisa sin bloquear**.
> Diseño completo en `docs/specs/2026-06-12-mvp-praxis-hooks-design.md` (leer primero).
> Multi-CLI vía el meta-plugin `cli-plugin-template`.
>
> **Estado (2026-06-15):** MVP + 4 features mergeadas a `main` y pusheadas a `origin`:
> (1) reglas de arquitectura + drift + auditoría con disparadores; (2) reglas TS/Tailwind
> Fase 1; (3) baseline/suppress; (4) reglas custom por proyecto. 51/51 tests verdes.
> El MVP (Q1-Q3 originales) está completo — movido a `.todo/DONE.md`.

## ⭐ Pendientes reales (próximas features — elegidas en la divergencia)

- [ ] **Fase 2 TS con AST (`Pick`/`Omit`/derivación de tipos)** — las reglas de *reuso real*
      de tipos cruzando archivos (sugerir `Pick<Otro, ...>`/`Omit`, derivar en vez de duplicar)
      necesitan el type-checker de TS (no se hace honesto con regex). Implica dependencia
      `typescript` + una nueva clase de **"ast rule"** que corra solo en la auditoría (lenta).
      Es la continuación natural del grupo `typescript` (Fase 1 ya mergeada). _(creado por: SmithDR · 2026-06-15)_
- [ ] **Salida SARIF + GitHub Action** — `praxis-audit --format sarif` + un workflow de CI que
      corre el audit y comenta el PR (code scanning). Saca el plugin del loop del agente y lo
      lleva al pipeline. Bajo esfuerzo (el motor ya devuelve findings estructurados). _(creado por: SmithDR · 2026-06-15)_
- [ ] **Plan B: neutralizar secretos fake de los tests para esquivar GitHub push protection** —
      los fixtures/tests usan `sk_live_…` con formato real (necesario: es un detector de secretos),
      y GitHub los marca como "Stripe API Key" en cada push (hoy se resolvió permitiéndolos a mano).
      Fix durable: acortar los fakes a <24 chars (siguen matcheando la regla, que pide 16+, pero
      esquivan el detector de Stripe de GitHub que pide 24+). Requiere reescribir el historial o
      aplicarlo de acá en más. _(creado por: SmithDR · 2026-06-15)_
- [ ] **Aprovechar a fondo TS + Tailwind para "código bien logrado"** — profundizar los dos grupos
      más allá de Fase 1, hacia reglas que *empujen activamente* hacia código idiomático y de calidad:
      - **Tailwind:** premiar/sugerir el uso de los **objetos y clases custom del proyecto** (tokens
        del `tailwind.config` theme, utilities propias, `@apply`, componentes con `cva`/`tailwind-variants`)
        en vez de valores sueltos — leyendo el theme para validar contra la paleta/spacing reales
        (extiende `tailwind-arbitrary-values`, que hoy solo detecta el patrón sin parsear el theme).
      - **TypeScript:** guiar el aprovechamiento de todas las bondades del sistema de tipos
        (utility types, generics, discriminated unions, `satisfies`, branded types, `as const`,
        inferencia desde schemas Zod/Valibot, etc.) para código mejor tipado y reutilizable.
      Engancha con la Fase 2 AST (lo más profundo necesita el type-checker) y con leer `tailwind.config`.
      _(creado por: SmithDR · 2026-06-15)_

## Q4 — Backlog / futuro (NO en v1)

- [ ] Skills de conocimiento/convenciones Next.js.
- [ ] Slash commands de scaffolding (`/new-module`, `/new-api-route`).
- [ ] Auditorías on-demand (performance, a11y, SEO, bundle size).
- [ ] Parsing AST (si los falsos positivos del regex molestan).
- [ ] Severidad `error` / bloqueo de ediciones (opt-in).
- [ ] Publicar en marketplace.