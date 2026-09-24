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

## 📄 Licencia

Este proyecto está bajo los términos arquitectónicos de código abierto permisivo (bases de motor MIT / Apache 2.0).
