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


- [ ] **`@apply` en el mensaje de bloat** — complemento de "abstracción cva" (la parte cva se hace ahora):
      además de sugerir `cva`/`tailwind-variants`, detectar si el proyecto tiene CSS con `@apply` (o capacidad
      de usarlo) y ofrecer "extraé a una utility/clase con `@apply`" como alternativa en el aviso de
      `tailwind-classname-bloat`. Requiere conciencia de CSS (qué archivo, escanear `@apply`), por eso se
      separó de la parte cva (que va por `package.json`). _(creado por: SmithDR · 2026-06-16)_

- [ ] **Generación automática de tests para archivos/componentes** — una capacidad (skill y/o slash
      command, ej. `/gen-tests <archivo>`) que, dado un archivo o componente, genera el archivo de test
      correspondiente (scaffolding): detecta el framework de test del proyecto (vitest/jest/node:test),
      la convención de ubicación/nombre (`__tests__/`, `*.test.tsx` al lado, etc.), e infiere casos base
      (render, props, ramas). A definir en su propia divergencia: alcance (solo scaffold vs casos reales),
      cómo se invoca, y si reusa el análisis AST que ya tenemos. _(creado por: SmithDR · 2026-06-16)_

- [ ] **Auditar componentes similares → unificar en compartidos** — un auditor (project rule / regla AST en
      `--deep`, o un hook on-demand) que detecte **componentes React parecidos o duplicados** entre archivos
      (misma estructura JSX / props / lógica) que convendría **unificar en un componente compartido** y reutilizar.
      Señala los candidatos y sugiere extraerlos a `shared/`/`components/`. Es el equivalente "a nivel componente"
      de `type-duplicate-shape` (que ya hace eso para tipos). A definir en su divergencia: cómo medir "similar"
      (fingerprint de la estructura JSX/AST, umbral de similitud), ruido vs señal, y dónde proponer el shared.
      Engancha con la infra AST de Fase 2 (`buildTsContext`). _(creado por: SmithDR · 2026-06-16)_

## Q4 — Backlog / futuro (NO en v1)

- [ ] Skills de conocimiento/convenciones Next.js.
- [ ] Slash commands de scaffolding (`/new-module`, `/new-api-route`).
- [ ] Auditorías on-demand (performance, a11y, SEO, bundle size).
- [ ] Parsing AST (si los falsos positivos del regex molestan).
- [ ] Severidad `error` / bloqueo de ediciones (opt-in).
- [ ] Publicar en marketplace.