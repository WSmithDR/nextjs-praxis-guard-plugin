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


- [ ] **Premiar abstracción de componentes Tailwind (@apply/cva)** — refinar el mensaje de
      `tailwind-classname-bloat` (que ya detecta `className` con demasiadas clases): si el proyecto usa
      `cva`/`tailwind-variants` (detectable por el import) o tiene CSS con `@apply`, sugerir extraer la
      lista larga a un componente/utility en vez del aviso genérico. NO es theme-aware (estructural) y
      solapa con `tailwind-classname-bloat` — por eso se sacó del sub-proyecto B; va como refinamiento de
      esa regla, no como regla nueva. _(creado por: SmithDR · 2026-06-16)_

- [ ] **Generación automática de tests para archivos/componentes** — una capacidad (skill y/o slash
      command, ej. `/gen-tests <archivo>`) que, dado un archivo o componente, genera el archivo de test
      correspondiente (scaffolding): detecta el framework de test del proyecto (vitest/jest/node:test),
      la convención de ubicación/nombre (`__tests__/`, `*.test.tsx` al lado, etc.), e infiere casos base
      (render, props, ramas). A definir en su propia divergencia: alcance (solo scaffold vs casos reales),
      cómo se invoca, y si reusa el análisis AST que ya tenemos. _(creado por: SmithDR · 2026-06-16)_

## Q4 — Backlog / futuro (NO en v1)

- [ ] Skills de conocimiento/convenciones Next.js.
- [ ] Slash commands de scaffolding (`/new-module`, `/new-api-route`).
- [ ] Auditorías on-demand (performance, a11y, SEO, bundle size).
- [ ] Parsing AST (si los falsos positivos del regex molestan).
- [ ] Severidad `error` / bloqueo de ediciones (opt-in).
- [ ] Publicar en marketplace.