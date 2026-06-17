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

_(sin pendientes — todas las features elegidas en la divergencia están en `.todo/DONE.md`)_

## Q4 — Backlog / futuro (NO en v1)

- [ ] Skills de conocimiento/convenciones Next.js.
- [ ] Slash commands de scaffolding (`/new-module`, `/new-api-route`).
- [ ] Auditorías on-demand (performance, a11y, SEO, bundle size).
- [ ] Parsing AST (si los falsos positivos del regex molestan).
- [ ] Severidad `error` / bloqueo de ediciones (opt-in).
- [ ] Publicar en marketplace.