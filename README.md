# Duvarret 📖✨

> **Director Agéntico de Literatura Polimórfica y Compilador Multimedia**

Duvarret es un entorno de co-creación literaria y estación de trabajo de autoría diseñado para **artistas, novelistas, diseñadores narrativos y divulgadores**. Su objetivo fundamental es **desacoplar el texto de su soporte físico tradicional**, permitiendo transformar un manuscrito en una experiencia interactiva ejecutable (.exe nativo < 20 MB, Web/PWA, o Audio-drama 3D binaural puro sin pantalla) mediante la co-dirección con un agente de inteligencia artificial y sin que el autor toque una sola línea de código.

---

## 🤖 Para Agentes Autónomos de IA (Cloud / Cursor / Devin / OpenHands)

Si eres un agente de IA que trabajará de forma autónoma en este repositorio, **sigue la directiva de arranque inmediata**:

👉 **Lee atentamente y ejecuta las instrucciones de:** [`AGENT_INSTRUCTIONS.md`](./AGENT_INSTRUCTIONS.md)

Allí encontrarás el protocolo del **Bucle Autónomo de Auto-reparación (TDD)**, las **Oleadas de Desarrollo (Waves)** y la obligación de crear el archivo `MASTER_IMPLEMENTATION_PLAN.md` antes de escribir código.

---

## 📚 Documentación del Proyecto

Toda la especificación técnica y de producto aprobada se encuentra en la carpeta [`docs/`](./docs/):

1. **[01. Documento de Requisitos de Producto (PRD)](./docs/01_PRD_DOCUMENTO_REQUISITOS_PRODUCTO.md)**: Visión, usuarios objetivo, requisitos funcionales/no funcionales y modelo de negocio en 3 fases.
2. **[02. Documento de Arquitectura de Software y Sistema (ADD)](./docs/02_ARQUITECTURA_DEL_SISTEMA.md)**: Stack técnico (Tauri v2 + Vue 3 + Pinia), pipeline agéntico desacoplado, motor de audio espacial 3D (Resonance Audio) y grafo semántico local embebido (SQLite).
3. **[03. Especificación Técnica del Manifiesto Declarativo](./docs/03_ESPECIFICACION_STORY_MANIFEST.md)**: Contrato JSON estricto (`story_manifest.json`), catálogo de directivas tipográficas, eventos acústicos y sandboxes de minijuegos.
4. **[04. Especificación de Diseño UI/UX: Duvarret Studio](./docs/04_DISENO_UI_UX_EDITOR_ARTISTAS.md)**: Diseño tripartito en Split-View en tiempo real, lienzo libre de distracciones, tarjetas de dirección agéntica y radar acústico interactivo.
5. **[05. Roadmap y Plan de Desarrollo de Ingeniería](./docs/05_ROADMAP_PLAN_DESARROLLO.md)**: Fases de desarrollo por sprints, estrategia de dogfooding comercial con obra de dominio público y KPIs.

---

## 🛠️ Stack Tecnológico Principal

- **Shell de Escritorio:** [Tauri v2](https://tauri.app/) (Rust) — Binarios < 20 MB y bajo consumo de memoria.
- **Frontend / Editor:** [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/) + [Pinia](https://pinia.vuejs.org/) + [TailwindCSS](https://tailwindcss.com/).
- **Renderizado Tipográfico:** CSS Shaders + WebGL / [PixiJS](https://pixijs.com/).
- **Audio Psicoacústico 3D:** Google Resonance Audio SDK / Web Audio API HRTF + Valve Steam Audio (WASM).
- **Cerebro Semántico Local:** SQLite embebido con extensiones FTS5 y JSON (Offline-first / Graph RAG).
- **Agnosticismo de IA:** Tool Calling estándar compatible con Gemini, Claude, OpenAI y modelos locales vía Ollama.

---

## 🚀 Puesta en marcha

Requisitos: Node 22+, y para el ejecutable nativo Rust estable + las dependencias de sistema de [Tauri v2](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run dev              # Duvarret Studio en el navegador (http://localhost:1420)
npm run tauri dev        # Duvarret Studio como aplicación de escritorio
```

El Studio abre por defecto la obra insignia **El Corazón Delator** (`works/el-corazon-delator.duvarret`). Añade `?obra=bienvenida` a la URL para abrir la obra mínima de bienvenida.

### Compilar y exportar una obra

Desde el Studio: botón **▶ Exportar** (Web/PWA y audio-drama en ZIP; ejecutable portátil en la app de escritorio). Desde la terminal:

```bash
npm run duvarret -- validate works/el-corazon-delator.duvarret
npm run duvarret -- export   works/el-corazon-delator.duvarret --target web --zip      # Web / PWA sin conexión
npm run duvarret -- export   works/el-corazon-delator.duvarret --target audio --zip    # audio-drama accesible
npm run duvarret -- export   works/el-corazon-delator.duvarret --target native         # binario nativo (LTO, < 20 MB)
npm run duvarret -- export   works/el-corazon-delator.duvarret --target portable       # reproductor + carpeta obra/
npm run duvarret -- ingest   mi-novela.pdf --out Mi_Novela.duvarret                    # manuscrito → escenas de 300–800 palabras
```

### Calidad

| Comando | Qué verifica |
| :--- | :--- |
| `npm run typecheck` | TypeScript estricto (`vue-tsc`) |
| `npm run lint` | ESLint sin avisos (prohíbe `eval`, `new Function` y `any`) |
| `npm test` | Vitest: manifiesto, runtime, audio simulado, lore SQLite, agente, Studio |
| `npm run test:e2e` | Playwright contra el build real |
| `cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test` | Shell nativo |

El plan de trabajo completo, con cada tarea verificada, está en [`MASTER_IMPLEMENTATION_PLAN.md`](./MASTER_IMPLEMENTATION_PLAN.md).

## 🗂️ Estructura del código

```
src/core/       Lógica sin interfaz: manifest (Zod + JSON Schema), lore (SQLite + continuidad),
                agent (proveedores, herramientas, orquestador), ingest, compiler, project, assets
src/runtime/    Duvarret Runtime: máquina de estados, tipografía ergódica, audio 3D, modo sin pantalla,
                novela visual y minijuegos en sandbox
src/studio/     Duvarret Studio: layout tripartito, lienzo, Pitch Cards, radar acústico, exportación
src/player/     Entrada del reproductor aislado (Web/PWA y binario)
src-tauri/      Shell Tauri v2 (Rust): proyectos .duvarret, SQLite, protocolo obra:// portátil
works/          Obras de ejemplo (.duvarret)
schemas/        JSON Schema generado del story_manifest.json
scripts/        CLI (duvarret), foley sintetizado, obra insignia, build de escritorio
```

### Co-director y modelos

El agente funciona sin conexión con el **director local** (heurístico, determinista). En ⚙ Preferencias se puede elegir Anthropic Claude (SDK oficial, `claude-opus-5` por defecto), OpenAI, Google Gemini u Ollama local. Las claves se guardan solo en el dispositivo, nunca dentro de la obra. El agente jamás genera código: únicamente invoca herramientas que editan el manifiesto a través del validador.

---

## 📄 Licencia

Este proyecto está bajo los términos arquitectónicos de código abierto permisivo (bases de motor MIT / Apache 2.0).
