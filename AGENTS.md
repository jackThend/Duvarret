# Duvarret

Estudio de autoría (Vue 3 + TS + Pinia + Tailwind 4) que compila obras literarias interactivas a Web/PWA, audio-drama y ejecutable nativo (Tauri v2, Rust). Interfaz, textos y commits en español.

## Mapa
- `src/core/` — lógica sin UI: `manifest/` (esquema Zod, validación, caminos), `agent/` (proveedores de IA, orquestador, herramientas, `probe.ts`), `ingest/` (txt/md/pdf/docx/epub → escenas), `compiler/`, `project/`, `assets/`, `lore/`.
- `src/runtime/` — reproductor de la obra (componentes, audio espacial).
- `src/studio/` — Studio: `stores/` (Pinia), `components/`, `services/`.
- `src-tauri/` — shell nativo (comandos de proyecto, protocolo `obra://`).
- `scripts/` — CLI `duvarret.ts`, `build-desktop.ts`, `measure-ram.ts`.
- `works/el-corazon-delator.duvarret` — obra insignia. `docs/` — documento principal y guías de validación, publicación y voz.
- Documento principal: `docs/PROYECTO_DUVARRET.md`. Estado y próximos pasos: `MASTER_IMPLEMENTATION_PLAN.md`. Los diseños iniciales y las oleadas anteriores están archivados en `docs/archivo/`.

## Comandos (de más barato a más caro)
- Una prueba unitaria: `npx vitest run <ruta-del-test>` · una E2E: `npx playwright test -g "<nombre>"`
- Antes de subir: `npx vue-tsc --noEmit` y `npm run lint` (`--max-warnings 0`).
- Suites completas: `npx vitest run --maxWorkers=2` y `npx playwright test --workers=2`. El tiempo depende del equipo; 0.2.0 tiene 446 casos unitarios y 20 E2E.
- Rust: `cd src-tauri && cargo test`.
- Caros, solo si hacen falta: `npm run duvarret -- export <obra> --target native` y `npm run build:desktop` (varios minutos y empaquetado adicional de la voz). El CI ya compila los ejecutables de Windows, macOS y Linux en cada push.

## Convenciones
- Commits: `feat(oleada-N): …`, `fix(área): …`, en español.
- El agente nunca escribe JSON a mano: toda edición del manifiesto pasa por las herramientas y el validador.
- Las pruebas de componentes usan `@vue/test-utils` con jsdom; `src/test/setup.ts` simula `URL.createObjectURL`.
- `@tauri-apps/plugin-*` en npm debe coincidir en mayor/menor con su crate de Rust, o `tauri build` falla.

## Documentación y limpieza

- Mantener una descripción principal en `docs/PROYECTO_DUVARRET.md`; el PDF es una copia generada de esa fuente. Guías especializadas en `docs/README.md`.
- No borrar obras, recursos originales, dependencias de voz ni la instalación registrada por parecer carpetas de prueba. Verificar rutas absolutas, procesos y registro antes de limpiar salidas nativas.
- Conservar informes y hashes antes de retirar extracciones o perfiles de QA. Registrar los avances en la memoria local de continuidad.
