# Duvarret

Estudio de autoría (Vue 3 + TS + Pinia + Tailwind 4) que compila obras literarias interactivas a Web/PWA, audio-drama y ejecutable nativo (Tauri v2, Rust). Interfaz, textos y commits en español.

## Mapa
- `src/core/` — lógica sin UI: `manifest/` (esquema Zod, validación, caminos), `agent/` (proveedores de IA, orquestador, herramientas, `probe.ts`), `ingest/` (txt/md/pdf/docx/epub → escenas), `compiler/`, `project/`, `assets/`, `lore/`.
- `src/runtime/` — reproductor de la obra (componentes, audio espacial).
- `src/studio/` — Studio: `stores/` (Pinia), `components/`, `services/`.
- `src-tauri/` — shell nativo (comandos de proyecto, protocolo `obra://`).
- `scripts/` — CLI `duvarret.ts`, `build-desktop.ts`, `measure-ram.ts`.
- `works/el-corazon-delator.duvarret` — obra insignia. `docs/` — requisitos y `06_VALIDACION.md`.
- Plan y estado por oleadas: `MASTER_IMPLEMENTATION_PLAN.md`.

## Comandos (de más barato a más caro)
- Una prueba unitaria: `npx vitest run <ruta-del-test>` · una E2E: `npx playwright test -g "<nombre>"`
- Antes de subir: `npx vue-tsc --noEmit` y `npm run lint` (`--max-warnings 0`).
- Suites completas: `npm test` (unas 290 pruebas, ~15 s) y `npm run test:e2e` (~20 s).
- Rust: `cd src-tauri && cargo test`.
- Caros, solo si hacen falta: `npm run duvarret -- export <obra> --target native` (~1,5 min) y `npm run build:desktop` (~4 min, miles de líneas de log). El CI ya compila los ejecutables de Windows, macOS y Linux en cada push.

## Convenciones
- Commits: `feat(oleada-N): …`, `fix(área): …`, en español.
- El agente nunca escribe JSON a mano: toda edición del manifiesto pasa por las herramientas y el validador.
- Las pruebas de componentes usan `@vue/test-utils` con jsdom; `src/test/setup.ts` simula `URL.createObjectURL`.
- `@tauri-apps/plugin-*` en npm debe coincidir en mayor/menor con su crate de Rust, o `tauri build` falla.
