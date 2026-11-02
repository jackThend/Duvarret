# MASTER IMPLEMENTATION PLAN — Duvarret

> Brújula persistente del bucle autónomo. Cada micro-tarea tiene **objetivo**, **archivos**, **verificación** y **criterio de éxito**.
> Estado: `[ ]` pendiente · `[x]` verificada y consolidada (commit `feat(oleada-X): …`).

## Convenciones globales

Publicación web comprobada (2026-10-19): **https://jackthend.github.io/el-ultimo-minuto/**, repositorio público separado `jackThend/el-ultimo-minuto`. Solo cuento exportado, voz e imágenes; GitHub Pages en `codex/publicacion`. Controles táctiles añadidos al modo audio y probados en el enlace real con Pixel 7 emulado, ambos finales, voz sin solapamientos y recorrido offline. Evidencias y guía de futuras publicaciones en `terminados/el-ultimo-minuto/PUBLICACION.md` y `VERIFICACION-GITHUB-PAGES.txt`.

Entrega del cuento 1.3.0 (2026-10-19): actualización integrada en **Narración y voz**, con síntesis local, progreso, integración sobre las ediciones actuales y guardados serializados. Interpretación dulce persistente, narración directa sin eco, cuatro ilustraciones de cómic lofi y ejecutables renovados en `terminados/el-ultimo-minuto`. Botón probado en el .exe real: WAV nuevo, guardado y publicación desbloqueada sin cerrar; segunda pasada sin frases nuevas. Resultados y decisiones en `terminados/MEMORIA.md`.

Entrega nativa comprobada (2026-10-19): `terminados/el-ultimo-minuto/Duvarret-Studio.exe`, reproductor `player/` y cuento `portable/`. Build release real mediante `scripts/build-windows.ps1 -SinInstalador`. Prueba WebView2 de apertura, edición, guardado, voz persistente, bloqueo de publicación pendiente y audio nativo sin solapamientos. Compatibilidad CSP: WASM habilitado, Zod jitless y sustitución estática del noop dinámico de Resonance. Sincronización de prosa/narración centralizada en ManifestEditor. Detalles y resultados de verificación en `terminados/MEMORIA.md` y los informes Windows junto a la obra.

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
- [x] **4.2 Registro de herramientas**
  - Archivos: `src/core/agent/tools/*.ts`
  - `queryLoreGraph`, `updateLoreEntity`, `validateContinuity`, `setTypographicEffect`, `setVisualNovelSegment`, `placeSpatialAudio`, `mountSimulatedModule`, `requestAssetSynthesis`.
  - Todas mutan el manifiesto solo a través del validador (sin `eval`).
- [x] **4.3 Orquestador (bucle de tool calling)**
  - Archivos: `src/core/agent/orchestrator.ts`
- [x] **4.4 Intérprete espacial en lenguaje natural (RF-11)**
  - Archivos: `src/core/agent/spatialLanguage.ts`
- [x] **4.5 Ingesta y Scene Parsing (.txt/.md/.pdf/.docx/.epub)**
  - Archivos: `src/core/ingest/{readers.ts,office.ts,sceneParser.ts,toneAnalyzer.ts}`
  - .docx: estilos de título/encabezado de Word (en cualquier idioma), tabuladores, saltos y control de cambios.
  - .epub: orden del índice (spine), títulos `<h1>`–`<h3>` o maquetados con CSS, entidades HTML.
  - Beats de 300–800 palabras respetando capítulos; tono e interacción candidata.
- [x] **4.6 Director local heurístico (offline, sin LLM)**
  - Archivos: `src/core/agent/localDirector.ts` — genera Pitch Cards y llamadas a herramientas deterministas.
- [x] **4.7 Tests de integración del pipeline con mocks**

## OLEADA 5 — Duvarret Studio

- [x] **5.1 Store del proyecto y persistencia `.duvarret`**
  - Archivos: `src/studio/stores/{project.ts,studio.ts}`, `src/core/project/*.ts`
- [x] **5.2 Layout tripartito 20/45/35 con panel izquierdo colapsable**
- [x] **5.3 Panel izquierdo: árbol de beats, personajes, inventario, grafo constelación**
- [x] **5.4 Lienzo de escritura + Ghost Markers + alerta de continuidad**
- [x] **5.5 Pitch Cards + barra de entrada natural**
- [x] **5.6 Live Preview reactivo (< 200 ms)**
- [x] **5.7 Radar acústico 3D arrastrable**
- [x] **5.8 Temas “Tinta y Pergamino Nórdico” y “Cuaderno de Manuscrito”**
- [x] **5.9 Atajos de teclado y ARIA**
- [x] **5.10 Pruebas E2E Playwright**

## OLEADA 6 — Compilador, Exportación y Obra Insignia

- [x] **6.1 Compilador interno (validación + optimización + inyección)**
  - Archivos: `src/core/compiler/*.ts`, `scripts/duvarret.ts`
- [x] **6.2 Exportación Web/PWA autocontenida**
- [x] **6.3 Exportación de audio-drama autocontenido**
- [x] **6.4 Binario nativo del reproductor (Tauri, perfil release LTO)**
- [x] **6.5 Obra insignia: *El Corazón Delator* (E. A. Poe)**
  - `works/el-corazon-delator.duvarret/` con manifiesto completo y foley sintetizado.
- [x] **6.6 CI multiplataforma (GitHub Actions)**
- [x] **6.7 Verificación final de builds**

## OLEADA 7 — Autoría autónoma (sin depender del agente ni del JSON)

- [x] **7.1 Obras: abrir, crear y recordar**
  - Archivos: `src/core/project/workLibrary.ts`, `src/studio/services/{desktop.ts,workManager.ts}`, `src/studio/composables/useWorks.ts`, `src/studio/components/WorksDialog.vue`, `src-tauri/src/{lib.rs,project.rs}`
  - Escritorio: diálogo nativo de carpetas, creación de `<Título>.duvarret` sin sobrescribir nunca otra obra, recursos servidos solo desde la carpeta abierta.
  - Navegador: varias obras en el dispositivo; obras recientes; se guarda la obra actual antes de cambiar; importar un manuscrito crea una obra nueva.
  - Verificación: `npm test -- workLibrary workManager useWorks`, E2E «Obras», `cargo test`.
- [x] **7.2 Recursos propios: arrastrar y soltar sonidos e imágenes**
  - Archivos: `src/core/assets/usages.ts`, `src/studio/services/assetStore.ts`, `src/studio/components/AssetsDialog.vue`, `src/studio/stores/project.ts`, `src-tauri/src/project.rs`
  - Almacenes: carpeta `assets/` en el escritorio, IndexedDB en el navegador; catálogo de procedencia «obra de la autora».
  - Recursos que faltan (se aportan en su lugar exacto), colocación sin JSON (retrato, ilustración, icono, sonido de escena, narración, ambiente) y retirada con aviso.
  - El ambiente de fondo de la obra (`ambience_bed`) ahora suena en el runtime; el motor recarga sonidos aportados sin reiniciar.
  - Verificación: `npm test -- usages assetStore assets`, E2E «Recursos propios» (incluye exportación), `cargo test`.
- [x] **7.3 Editor visual de bifurcaciones**
  - Archivos: `src/core/manifest/navigation.ts`, `src/studio/components/PathsEditor.vue`, `src/studio/components/PathsMap.vue`, `src/studio/stores/project.ts`
  - «Caminos de la escena» bajo el lienzo: continuación natural, final, elecciones (texto, destino, orden), condiciones en lenguaje llano (acontecimiento ocurrido o no, objeto, atributo mínimo) y marcas que deja cada elección; «＋ Escena nueva» como destino directo.
  - «Mapa de caminos» (`Ctrl/⌘+M`): escenas por distancia al inicio, continuaciones, elecciones, desenlaces de enigma y atajos sin pantalla; avisa de escenas sin camino de llegada y de caminos rotos; pulsar una escena la abre.
  - Todo cambio es deshacible y se refleja al momento en la vista previa.
  - Verificación: `npm test -- navigation paths`, E2E «Caminos».

---

## OLEADA 8 — Validación en condiciones reales

Resultados detallados y método en `docs/06_VALIDACION.md`.

- [x] **8.1 Compilación de escritorio completa** (`npm run build:desktop`): Studio 6,7 MB con el reproductor de 5,3 MB incluido; `.deb` y `.rpm` de 6,1 MB y AppImage de 79 MB (lleva WebKitGTK).
- [x] **8.2 Medición de memoria** (`npm run medir-ram`): PSS y memoria privada de todo el árbol de procesos, con clics simulados para medir jugando.
  - Resultado: RNF-02 (< 150 MB) no se cumple en Linux. WebKitGTK con una página vacía ya ocupa 199 MB sin composición GL y 322 MB con GL por software. El reproductor añade de 27 a 87 MB.
  - Pendiente: medir en Windows (WebView2) y macOS, y decidir si RNF-02 se reformula por plataforma.
- [ ] **8.3 Proveedores de IA reales** (`npm run duvarret -- probar-ia`, y en el Studio ⚙ Preferencias → Probar conexión)
  - [x] Prueba de extremo a extremo con cuatro comprobaciones (conexión, uso de herramientas, colocación, validez), sin tocar la obra.
  - [x] Director local: supera la prueba. Ollama: mensajes con el paso concreto para cada fallo habitual.
  - [x] Corregido: un identificador de escena inventado por el modelo ya no crea una escena vacía.
  - [ ] Claude con la API real (necesita `ANTHROPIC_API_KEY`).
  - [ ] Ollama con un modelo real (el entorno de desarrollo no puede descargar Ollama ni sus modelos).

---

## Próximos pasos (acordados, sin empezar)

1. **Cerrar 8.3:** probar `probar-ia` con Claude (necesita `ANTHROPIC_API_KEY`) y con Ollama y un modelo real.
2. **Memoria en Windows y macOS:** ✓ medida en el CI (65 MB en Windows, 62 MB en macOS en la pantalla de título; ver `docs/06_VALIDACION.md`). Pendiente: medir jugando y **decidir si RNF-02 se reformula** (decisión del autor del producto).
3. **Publicación:**
   - narración grabada para la obra insignia (modo sin pantalla): ✓ el Studio graba o importa la voz por escena y el reproductor la usa; falta **grabar la voz** de las escenas de la obra insignia (necesita una persona);
   - pulir la obra insignia: ✓ primera pasada (errata corregida; en modo sin pantalla los atajos respetan las condiciones de las elecciones; prueba que la recorre entera con el teclado); la revisión literaria queda para el autor;
   - prueba de escucha a ciegas para el KPI 3 (sonido 3D): ✓ en ⚙ Preferencias; faltan **las pruebas con personas** (objetivo: más del 90 % de aciertos);
   - firma de código de los ejecutables (Windows y macOS): ✓ preparada en la CLI y el CI (`docs/07_PUBLICACION.md`); falta **comprar los certificados y añadirlos como secretos** del repositorio.

---

## Registro de verificación final

| Verificación | Resultado |
| :--- | :--- |
| `npm run typecheck` / `npm run lint` | Sin errores ni avisos |
| `npm test` (Vitest) | 220 pruebas en verde (21 archivos) |
| `npm run test:e2e` (Playwright, Chromium) | 11 pruebas en verde (Studio, obra insignia, exportación) |
| `cargo clippy -D warnings` / `cargo test` | En verde (proyecto, protocolo `obra://`) |
| Validación de la obra insignia | 14 escenas, 0 errores, 0 avisos |
| Exportación Web/PWA | 26 archivos, 1,34 MB (ZIP 0,89 MB); service worker activo; sin errores en navegador |
| Exportación audio-drama | Arranca en modo sin pantalla, guion accesible y lista M3U |
| Binario nativo Linux (release, LTO) | 5,58 MB (< 20 MB); arranca bajo Xvfb |
| Binarios Windows / macOS | Delegados al CI (`.github/workflows/ci.yml`, matriz de tres sistemas con comprobación de tamaño) |

Pendiente / limitaciones conocidas:
- El `.exe` de Windows y el `.app` de macOS solo se compilan en CI; en este entorno solo se verificó el binario Linux.
- La RAM se midió en la oleada 8 (ver `docs/06_VALIDACION.md`): RNF-02 se cumple en Windows y macOS (60–65 MB) y no en Linux, por la base de WebKitGTK.
- La transcodificación a Ogg/WebP depende de que `ffmpeg` esté instalado; sin él, los assets se empaquetan tal cual.

## Corrección de narración uniforme · 2026-10-19

- [x] Cola única para títulos, prosa, opciones y avisos, con cancelación al cambiar de escena. Archivos: runtime/screenless y audio. Verificación: regresiones de concurrencia y cancelación en Vitest; ninguna voz anterior puede continuar.
- [x] Voz natural persistida en la obra, catálogo por texto y comprobación de grabaciones pendientes tras editar. Archivos: manifest, compiler, assets, Studio. Verificación: tipos, esquema, exportación e invalidación; nunca sustituir silenciosamente una voz natural.
- [x] Generación local reutilizable con la misma voz para todas las frases y futuras ediciones. Archivos: scripts de narración y documentación. Verificación: regeneración incremental sin enviar texto a servicios externos.
- [x] Actualizar El último minuto y comprobar títulos → prosa → opciones, repetición y ambos finales en Chrome. Archivos: terminados. Criterio: cero intervenciones de speechSynthesis y cero solapamientos de voz, proyecto editable conservado.

Resultado: 333 pruebas / 40 archivos en verde (`npm test -- --maxWorkers=2`); `npm run build` (incluye vue-tsc) y `npm run lint` correctos. Chrome verifica las cuatro escenas, ayudas y controles, ambos finales y escucha sin conexión. Edición 1.2.0 en `terminados/el-ultimo-minuto` con 18 intervenciones de la misma voz; publicación de 35 archivos / 6.98 MB y ZIP de 4.64 MB. Incluye regresión del motor envuelto por Vue y caché PWA dependiente del contenido.

## Autoría sin fricción y segunda demo · 2026-10-20

- [x] Guardado automático recuperable, estado de guardado, deshacer/rehacer visibles, foco en diálogos y vistas compactas para escribir.
- [x] Publicación guiada: guardar antes, reparar voz desde el aviso, comprobar recursos y explicar cómo compartir cada formato. Auditoría: `docs/08_AUDITORIA_UX_DEMO.md`.
- [x] Sonido global apagado por defecto, silencio inmediato y persistente entre escenas, código táctil y voz de opciones condicionales.
- [x] El archivo de las mareas: 15 escenas, tres finales, cuatro módulos, cinco ilustraciones lofi y 78 grabaciones de la misma voz dulce. Editable, Web/PWA, ZIP y lector portátil en `terminados`.
- [x] Chrome: tres finales, fallos con continuación, inventario, condiciones, reanudación, modo táctil y PWA offline; lector portátil real probado con WebView2.
- [x] Entregar Studio recompilado y comprobar guardado automático, actualización de voz y exportación en el ejecutable final. WebView2: cierre nativo guarda el último cambio; ZIP real, foco, deshacer/rehacer y vista de 390 px correctos. Informes y capturas junto a El último minuto.

Registro detallado y límites de la entrega en `terminados/MEMORIA.md`. No se publica automáticamente la nueva obra en internet ni se actualiza el enlace público anterior.

Publicación posterior autorizada · 2026-10-20: El archivo de las mareas disponible en https://jackthend.github.io/el-archivo-de-las-mareas/ . Repositorio público separado, 97 archivos; despliegue de Pages correcto y tres finales, voz, móvil y lectura sin conexión comprobados sobre el enlace real. Detalles en `terminados/el-archivo-de-las-mareas/PUBLICACION.md`.

Evaluación para 1.0 · 2026-10-20: las demos no demuestran una instalación autocontenida. La voz aún requiere recursos externos preparados y la generación de imágenes del director reserva recursos pendientes. Se redactó `docs/09_PLAN_VERSION_1_0_SIN_FRICCION.md` con opciones de producto, evidencia y aceptación por fases. Es un plan propuesto, pendiente de implementación; no marcar las integraciones multimedia ni la instalación limpia como completadas por haber terminado los cuentos.

## Instalador híbrido de Windows · 2026-10-21

- Empaquetado de voz local autocontenida completado: Kokoro, intérprete y runtime privados, modelos, fuentes/licencias, CRT y WebView2 offline. eSpeak corregido para rutas Unicode reubicables. Sin Python/Codex externos en el flujo de generación del usuario.
- BYOK por capacidades: texto OpenAI/Anthropic/Gemini/Zen/compatible y opciones locales existentes; imágenes Gemini/Cloudflare; voz Gemini/OpenAI/ElevenLabs/compatible. Claves DPAPI separadas de obras y exportaciones. Pruebas cloud con mocks, sin claves reales.
- Protección de propuestas IA frente a ediciones concurrentes: 17 pruebas correctas; tipos y lint globales correctos. Reproductor ya aceptado reutilizado sin cambiar su SHA256.
- NSIS final real y QA completo PASS sobre instalación aislada persistente: voz nueva, escuchar, editar, regeneración incremental, cero regeneración al repetir, lector exportado y grabaciones sin voz del sistema. Instalador en `terminados/instalador-hibrido/Duvarret-0.1.0-voz-local-setup.exe`, 592.265.712 bytes, SHA256 `E52D1E90D5B91DC273C64C8761733C7D33E11CE9A5223AEA337A44C034D27C1E`. Informe final `prueba con tilde á-ExGGZ7/VERIFICACION-INSTALACION.json`.

Se conserva 0.1.0: no se certificó VM limpia ni 1.0, no hay firma digital propia, servicio gestionado ni publicación integrada. El avance por fases y los límites están actualizados en `docs/09_PLAN_VERSION_1_0_SIN_FRICCION.md`; detalles de uso, procedencia y evidencias en LEEME/MEMORIA de la entrega. Sin commits, push ni publicaciones nuevas.

### Continuidad de audio — 01-11-2026

Decisión §4.1 de `docs/11`: el libro contemplativo dispara las marcas de sonido siguiendo el scroll.
Tarea 7: corregida la ventana de lectura (65 % del área visible, respetando los contenedores del
Studio y del reproductor); los saltos rápidos recogen las marcas atravesadas, una vez por visita.
El tiempo estimado no dispara marcas en este modo. Seguimiento en el PR #6, rama
`feat/audio-validacion`. Las cinco comprobaciones de CI del estado previo del PR pasaron, incluido
Rust y los ejecutables de Windows, macOS y Linux.

### Aceptación con cuento de terror — 01-11-2026

- Relato original «La casa que aprendió mi nombre»: 12 escenas, dos finales, cubierta, novela visual,
  inventario, ambientes reales CC0, música y foley originales, narrador y personajes con Kokoro local.
- Añadidos `room_search` (linterna y recogida) y `lockpick` (pernos con teclado), disponibles para
  el director y exportados con sus assets. Corregido el falso callejón sin salida de puzles con elecciones.
- La prueba del ejecutable encontró y corrigió pasos ausentes en la preparación, exportación IPC de
  archivos grandes y desaparición prematura del expediente. La escritura nativa usa bloques y temporal.
- El lector Windows recompilado supera ambos finales, fracaso de ganzúa, abandono de búsqueda,
  inventario, expediente, efectos de texto y marca por scroll con retardo real. Informe local:
  `terminados/la-casa-que-aprendio-mi-nombre/verificacion-corregida/VERIFICACION.json`.
- Generación nativa de 60 intervenciones, regeneración incremental y reapertura se comprobaron en
  los intentos previos. Detalles, fuentes y límites: `docs/12_ACEPTACION_CUENTO_TERROR.md`.
- No fusionar ni publicar automáticamente. Las repeticiones concurrentes iniciales sufrieron tiempos
  de espera; la suite local final pasa las 430 pruebas. CI `41362029617` de `5c8bbb7`: cinco trabajos
  correctos, incluidos 18 E2E, Rust y compilaciones Windows/macOS/Linux. Se corrige además la carrera
  del guion CDP que podía recargar `about:blank` antes del arranque del lector.

### Aprendizajes dentro de la app y distribución

El catálogo de escenas ahora viaja con todos los proveedores; el director local reconoce y sugiere
ganzúa y búsqueda con linterna, con registro de objetos de inventario. El chat permite explorar las
capacidades. Compartir permite elegir formatos y obtener ZIP independientes, incluido el ejecutable
con su obra. Detalles y límites en `docs/13_CAPACIDADES_Y_FORMATOS.md`. El usuario autoriza fusionar
el PR #6 tras CI verde, publicar este cuento en GitHub Pages y copiarlo a Escritorio/Instaladores.
