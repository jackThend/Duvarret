# MASTER IMPLEMENTATION PLAN — Duvarret

> Brújula persistente del bucle autónomo. Cada micro-tarea tiene **objetivo**, **archivos**, **verificación** y **criterio de éxito**.
> Estado: `[ ]` pendiente · `[x]` verificada y consolidada (commit `feat(oleada-X): …`).

## Convenciones globales

| Comando | Propósito |
| :--- | :--- |
| `npm run typecheck` | `vue-tsc --noEmit` — cero errores, sin `any` injustificado |
| `npm run lint` | ESLint (flat config, Vue + TS) — cero errores |
| `npm test` | Vitest (jsdom) — unit + integración |
| `npm run test:e2e` | Playwright (Chromium headless) contra `vite preview` |
| `npm run build` | Build web del Studio |
| `npm run build:player` | Build web del Runtime aislado (reproductor) |
| `cargo check` / `cargo test` en `src-tauri` | Shell nativo Rust |

Estructura de código:

```
src/
  core/        # Lógica pura sin UI: manifest, lore, agent, ingest, compiler
  runtime/     # Duvarret Runtime (reproductor): store, tipografía, audio, módulos
  studio/      # Duvarret Studio (editor): layout, paneles, stores
  player/      # Punto de entrada aislado del reproductor (build de exportación)
src-tauri/     # Shell Tauri v2 (Rust) — Studio y Player
works/         # Obras de ejemplo (.duvarret)
scripts/       # CLI de compilación/exportación
e2e/           # Pruebas Playwright
```

---

## OLEADA 1 — Andamiaje y Contrato de Datos

- [x] **1.1 Andamiaje Vite + Vue 3 + TS + Pinia + Tailwind**
  - Archivos: `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.ts`, `src/App.vue`, `src/styles/main.css`
  - Verificación: `npm run typecheck && npm run build`
  - Éxito: build web generado en `dist/` sin errores.
- [x] **1.2 Tooling de calidad (ESLint, Vitest, Playwright)**
  - Archivos: `eslint.config.js`, `vitest` en `vite.config.ts`, `playwright.config.ts`, `src/test/setup.ts`
  - Verificación: `npm run lint && npm test`
  - Éxito: suite vacía/sonda pasa; linter en verde.
- [x] **1.3 Shell Tauri v2 (Rust)**
  - Archivos: `src-tauri/{Cargo.toml,build.rs,tauri.conf.json,src/main.rs,src/lib.rs,capabilities/default.json,icons/*}`
  - Verificación: `cd src-tauri && cargo check && cargo test`
  - Éxito: crate compila; comandos Rust con tests.
- [x] **1.4 Esquema Zod del `story_manifest.json` (doc 03 completo)**
  - Archivos: `src/core/manifest/schema.ts`, `src/core/manifest/catalog.ts`
  - Cubre: metadata, global_settings, character_registry, item_registry, acoustic_environment, nodes (typographic_engine, acoustic_events, visual_novel_overlay, gameplay_overlay, rpg_checks, screenless_mode, navigation).
  - Verificación: `npm test -- manifest`
  - Éxito: el ejemplo exhaustivo del doc 03 valida sin pérdidas.
- [x] **1.5 Validador tolerante con fallbacks (RNF-09)**
  - Archivos: `src/core/manifest/validator.ts`, `src/core/manifest/defaults.ts`
  - Reglas: `z` ausente → `0.0`; directivas desconocidas → valores seguros + aviso; nodos corruptos aislados; JSON ilegible → manifiesto vacío seguro con diagnóstico.
  - Verificación: `npm test -- validator`
  - Éxito: nunca lanza; devuelve `{ manifest, issues[] }`.
- [x] **1.6 Integridad referencial de nodos (compilación)**
  - Archivos: `src/core/manifest/integrity.ts`
  - Detecta: `transition_to_node`/`target_node`/`default_next_node`/atajos de teclado hacia nodos inexistentes, speakers/items no registrados, IDs duplicados.
  - Verificación: `npm test -- integrity`
  - Éxito: diagnósticos con severidad `error` bloquean la exportación.
- [x] **1.7 Carga de manifiestos y JSON Schema exportable**
  - Archivos: `src/core/manifest/loader.ts`, `schemas/story-manifest.schema.json`, `scripts/generate-schema.ts`
  - Verificación: `npm test -- loader && npm run schema`
  - Éxito: carga desde string/objeto/URL; JSON Schema generado y versionado.

## OLEADA 2 — Runtime Declarativo Universal

- [x] **2.1 Máquina de estados Pinia (`useStoryStore`)**
  - Archivos: `src/runtime/stores/story.ts`, `src/runtime/engine/conditions.ts`, `src/runtime/engine/rng.ts`
  - Navegación, flags, inventario, historial/backlog, stats RPG, chequeos pasivos deterministas (RNG con semilla), progreso de lectura, save/load.
  - Verificación: `npm test -- story`
  - Éxito: transiciones, condiciones y determinismo probados.
- [x] **2.2 Motor tipográfico ergódico (estilos)**
  - Archivos: `src/runtime/typography/effects.ts`, `src/runtime/components/ErgodicText.vue`
  - `narrow_corridor`, `heartbeat_tremor` (onda senoidal por BPM), `flicker`, `mirror_inverted`, `physics_fall`, respeto a `prefers-reduced-motion`.
  - Verificación: `npm test -- typography`
- [x] **2.3 Shader de licuado (`melt_text`) WebGL + fallback CSS**
  - Archivos: `src/runtime/typography/meltShader.ts`, `src/runtime/components/MeltCanvas.vue`
  - Verificación: tests con contexto WebGL simulado (compilación de shaders, uniforms) y ruta de fallback.
- [x] **2.4 Máscara de linterna (`flashlight_reveal`)**
  - Archivos: `src/runtime/components/FlashlightMask.vue`
  - Ratón + táctil + teclado (accesible), gradiente radial.
  - Verificación: tests DOM de posición y opacidad.
- [x] **2.5 Motor de audio espacial 3D**
  - Archivos: `src/runtime/audio/{SpatialAudioEngine.ts,rooms.ts,materials.ts,coordinates.ts,impulse.ts}`
  - HRTF `PannerNode`, reverberación convolutiva sintetizada por sala, filtros por material, atenuación por distancia, disparadores (`on_node_enter`, `on_text_reveal_percentage`, `on_choice_hover`, `on_puzzle_solve`), tono de prueba si falta el asset, degradación a estéreo.
  - Verificación: `npm test -- audio` con Web Audio API simulada.
- [x] **2.6 Modo Sin Pantalla (accesibilidad ciega)**
  - Archivos: `src/runtime/screenless/{ScreenlessController.ts,announcer.ts}`, `src/runtime/components/ScreenlessStage.vue`
  - Teclado numérico, atajos universales, ARIA live, síntesis de voz, foley.
  - Verificación: tests de atajos y anuncios.
- [x] **2.7 Novela Visual**
  - Archivos: `src/runtime/modules/VisualNovelOverlay.vue`, `src/runtime/composables/useTypewriter.ts`
  - Avatares por estado de ánimo, máquina de escribir, backlog, placeholder estilizado si falta sprite.
- [x] **2.8 Minijuegos en sandbox**
  - Archivos: `src/runtime/modules/{ModuleSandbox.vue,CrtTerminal.vue,CipherLock.vue,CircuitWiring.vue,FictionalDesktop.vue,terminalParser.ts}`
  - Emiten solo `success`/`failure`; errores capturados sin romper la historia (RNF-08).
- [x] **2.9 Reproductor integrado (`RuntimePlayer.vue`)**
  - Archivos: `src/runtime/components/{RuntimePlayer.vue,NodeView.vue,ChoiceList.vue,InventoryPanel.vue}`
  - Verificación: test de integración recorriendo un manifiesto completo.

## OLEADA 3 — Cerebro Semántico y Grafo de Lore

- [x] **3.1 Capa de drivers SQL (sql.js WASM / Tauri SQL)**
  - Archivos: `src/core/lore/driver.ts`, `src/core/lore/sqljsDriver.ts`, `src/core/lore/tauriDriver.ts`
- [x] **3.2 Esquema del grafo (`lore_graph.db`)**
  - Archivos: `src/core/lore/schema.sql.ts`, `src/core/lore/LoreGraph.ts`
  - Tablas `nodes`, `edges` (ponderadas, timeline), `flags`, `events` (causalidad temporal), FTS5, claves foráneas.
- [x] **3.3 Consultas del grafo**
  - Vecinos, búsqueda FTS, estado temporal de entidades, subgrafo para visualización.
- [x] **3.4 Supervisor de continuidad**
  - Archivos: `src/core/lore/continuity.ts`
  - Detecta: ítem consumido/destruido/confiscado reaparece, personaje muerto actúa, contradicción de ubicación, flag requerido ausente.
  - Rendimiento: < 50 ms con 1.000 entidades / 5.000 aristas.
- [x] **3.5 Tests de integridad referencial y rendimiento**

## OLEADA 4 — Pipeline del Agente Co-Director

- [x] **4.1 Contrato agnóstico de LLM (OpenAI tool schema)**
  - Archivos: `src/core/agent/types.ts`, `src/core/agent/providers/{openai,anthropic,gemini,ollama,index}.ts`
- [ ] **4.2 Registro de herramientas**
  - Archivos: `src/core/agent/tools/*.ts`
  - `queryLoreGraph`, `updateLoreEntity`, `validateContinuity`, `setTypographicEffect`, `setVisualNovelSegment`, `placeSpatialAudio`, `mountSimulatedModule`, `requestAssetSynthesis`.
  - Todas mutan el manifiesto solo a través del validador (sin `eval`).
- [ ] **4.3 Orquestador (bucle de tool calling)**
  - Archivos: `src/core/agent/orchestrator.ts`
- [ ] **4.4 Intérprete espacial en lenguaje natural (RF-11)**
  - Archivos: `src/core/agent/spatialLanguage.ts`
- [ ] **4.5 Ingesta y Scene Parsing (.txt/.md/.pdf)**
  - Archivos: `src/core/ingest/{readers.ts,sceneParser.ts,toneAnalyzer.ts}`
  - Beats de 300–800 palabras respetando capítulos; tono e interacción candidata.
- [ ] **4.6 Director local heurístico (offline, sin LLM)**
  - Archivos: `src/core/agent/localDirector.ts` — genera Pitch Cards y llamadas a herramientas deterministas.
- [ ] **4.7 Tests de integración del pipeline con mocks**

## OLEADA 5 — Duvarret Studio

- [ ] **5.1 Store del proyecto y persistencia `.duvarret`**
  - Archivos: `src/studio/stores/{project.ts,studio.ts}`, `src/core/project/*.ts`
- [ ] **5.2 Layout tripartito 20/45/35 con panel izquierdo colapsable**
- [ ] **5.3 Panel izquierdo: árbol de beats, personajes, inventario, grafo constelación**
- [ ] **5.4 Lienzo de escritura + Ghost Markers + alerta de continuidad**
- [ ] **5.5 Pitch Cards + barra de entrada natural**
- [ ] **5.6 Live Preview reactivo (< 200 ms)**
- [ ] **5.7 Radar acústico 3D arrastrable**
- [ ] **5.8 Temas “Tinta y Pergamino Nórdico” y “Cuaderno de Manuscrito”**
- [ ] **5.9 Atajos de teclado y ARIA**
- [ ] **5.10 Pruebas E2E Playwright**

## OLEADA 6 — Compilador, Exportación y Obra Insignia

- [ ] **6.1 Compilador interno (validación + optimización + inyección)**
  - Archivos: `src/core/compiler/*.ts`, `scripts/duvarret.ts`
- [ ] **6.2 Exportación Web/PWA autocontenida**
- [ ] **6.3 Exportación de audio-drama autocontenido**
- [ ] **6.4 Binario nativo del reproductor (Tauri, perfil release LTO)**
- [ ] **6.5 Obra insignia: *El Corazón Delator* (E. A. Poe)**
  - `works/el-corazon-delator.duvarret/` con manifiesto completo y foley sintetizado.
- [ ] **6.6 CI multiplataforma (GitHub Actions)**
- [ ] **6.7 Verificación final de builds**
