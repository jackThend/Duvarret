# Roadmap y Plan de Desarrollo de Ingeniería
## Proyecto: Duvarret — Director Agéntico de Literatura Polimórfica

**Versión:** 1.0.0  
**Fecha:** Septiembre 2026  
**Objetivo:** Plan de ejecución por fases para la construcción del motor, el editor, el agente co-director y la primera obra insignia comercial.

---

## 1. Visión Estratégica del Desarrollo

El plan de desarrollo de Duvarret sigue la filosofía de **"Dogfooding Primero"**:
Antes de intentar comercializar la herramienta a autores externos, el equipo utilizará Duvarret internamente para producir y lanzar **una obra maestra corta comercial** en Steam e itch.io basada en una obra de dominio público. Esto garantiza que el motor y el agente resuelvan problemas reales de producción antes de abrirse al público masivo.

---

## 2. Cronograma de Fases de Ingeniería

```
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 0: Arquitectura Base y Manifiesto Declarativo (Sprints 1 - 2)     │
│ Scaffold de Tauri v2, Vue 3, Pinia y validación de story_manifest.json │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 1: Runtime Universal & Motores Sensoriales (Sprints 3 - 5)        │
│ Shaders de texto ergódico, Audio 3D (Resonance Audio) y Novela Visual │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 2: Cerebro Agéntico & Grafo Semántico Local (Sprints 6 - 8)       │
│ Tool calling multi-proveedor, SQLite/Graph RAG y análisis de beats    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 3: Duvarret Studio — Interfaz Split-View (Sprints 9 - 11)         │
│ Lienzo de escritura, tarjetas de co-dirección y radar acústico         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 4: Compilador a un Clic y Empaquetado Nativo (Sprints 12 - 13)    │
│ Pipeline de Tauri CLI para .exe < 20 MB y exportación Web/PWA          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 5: Obra Insignia Comercial & Validación de Mercado (Sprints 14-16)│
│ Producción de la 1ª obra (Edgar Allan Poe / Doyle) y lanzamiento Steam│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Desglose Detallado por Fases

### Fase 0: Andamiaje y Manifiesto Declarativo (Semanas 1 - 4)
* **Objetivo:** Establecer los cimientos del repositorio y garantizar que el contrato de datos sea 100% determinista.
* **Entregables:**
  * Configuración del monorepositorio con **Tauri v2 + Vite + Vue 3 + TypeScript**.
  * Definición y validación del esquema formal **JSON Schema** para `story_manifest.json`.
  * Store reactivo base en **Pinia** para la gestión del árbol de nodos y la máquina de estados.
  * Validador de esquemas con fallbacks automáticos para tolerancia a alucinaciones.

### Fase 1: Runtime Universal y Motores Sensoriales (Semanas 5 - 10)
* **Objetivo:** Construir el reproductor capaz de renderizar todo el espectro polimórfico de salida.
* **Entregables:**
  * **Motor Tipográfico Ergódico:**
    * Animaciones de columna comprimida (*narrow corridor*).
    * WebGL Fragment Shaders para licuado de texto (*melt_text*) y temblor rítmico (*heartbeat_tremor*).
    * Máscara radial de linterna (*flashlight reveal*) en Canvas.
  * **Motor de Audio Espacial y Psicoacústica 3D:**
    * Integración de **Google Resonance Audio SDK** sobre Web Audio API.
    * Posicionamiento cartesiano $(x, y, z)$ con filtros HRTF y materiales de sala.
    * Conmutador para **Modo 100% Sin Pantalla** (audio-drama puro con navegación por teclado y lectores de pantalla).
  * **Módulos Interactivos:**
    * Componente de Novela Visual (caja de diálogo con máquina de escribir, retratos de avatares con estados de ánimo).
    * Emulador de Terminal CRT fósforo verde y puzle de ganzúa/combinación.

### Fase 2: Cerebro Agéntico y Grafo Semántico Local (Semanas 11 - 16)
* **Objetivo:** Implementar la inteligencia del co-director y la memoria ontológica a largo plazo sin dependencias de la nube.
* **Entregables:**
  * **Grafo Semántico Local Embebido (Graph RAG):**
    * Base de datos local en SQLite con extensiones JSON/FTS5 para persistir entidades, aristas y estados.
    * Motor de consultas para supervisión de continuidad activa (detección de inconsistencias de lore).
  * **Harness de IA Multi-Proveedor:**
    * Conector agnóstico basado en llamadas a herramientas (*tool calling*).
    * Soporte para Google Gemini (1.5 Pro / Flash), Anthropic Claude, OpenAI y modelos locales vía Ollama (Llama 3 / Mistral).
  * **Scene Parser & Beat Extractor:**
    * Ingesta de archivos `.pdf`, `.docx` y `.md` con segmentación semántica en unidades dramáticas de 300 a 800 palabras.

### Fase 3: Duvarret Studio — Interfaz Split-View para Artistas (Semanas 17 - 22)
* **Objetivo:** Ensamblar la estación de trabajo de autoría unificada con enfoque zen editorial.
* **Entregables:**
  * Layout tripartito en split-view con sincronización reactiva en tiempo real (< 200 ms).
  * Lienzo de escritura enriquecida libre de distracciones con *Ghost Markers*.
  * Consola conversacional del Agente con **Tarjetas de Propuesta Dramatúrgica (Pitch Cards)**.
  * **Widget del Radar Acústico 3D interactivo:** representación visual y arrastrable de fuentes de sonido relativas a la cabeza del oyente.
  * Gestor híbrido de assets (arrastrar y soltar manual + generador sintético vía prompts).

### Fase 4: Compilador a un Clic y Distribución Nativa (Semanas 23 - 26)
* **Objetivo:** Lograr que un autor pase de su manuscrito a un archivo `.exe` comercial en un solo clic.
* **Entregables:**
  * Pipeline automatizado con Tauri CLI:
    * Empaquetado del runtime ligero + assets optimizados + `story_manifest.json`.
    * Generación de ejecutable nativo para Windows (.exe) con peso inferior a 20 MB y uso de RAM < 150 MB.
  * Exportador a Web Estática / PWA para publicación inmediata en plataformas web o itch.io.
  * Exportador de paquete de Audio-Drama autocontenido para distribución accesible.

### Fase 5: La Obra Insignia Comercial (Dogfooding) (Semanas 27 - 32)
* **Objetivo:** Validar el sistema de extremo a extremo produciendo internamente una obra comercial de alta calidad.
* **Entregables:**
  * Selección de una obra de dominio público universal (ej. *El Corazón Delator* de Edgar Allan Poe o un caso de *Sherlock Holmes* de Arthur Conan Doyle).
  * Adaptación completa utilizando Duvarret Studio:
    * Tipografía que tiembla con el pulso cardíaco del asesino.
    * Latido de corazón y sonidos foley posicionales 3D a través de auriculares.
    * Careo de novela visual con los detectives e inspección de pruebas.
  * Publicación comercial en **Steam** e **itch.io** por $3.99 - $5.99 USD.
  * Recopilación de métricas de usuario, críticas y retroalimentación técnica.

---

## 4. Matriz de Riesgos y Mitigación

| Riesgo Técnico / Comercial | Probabilidad | Impacto | Estrategia de Mitigación |
| :--- | :--- | :--- | :--- |
| **Alucinación de código por parte de la IA** | Media | Crítico | **Mitigado por diseño:** El agente no escribe código ejecutable; solo rellena un manifiesto JSON validado por esquema estricto. |
| **Rendimiento deficiente en audio espacial en navegadores** | Baja | Medio | Uso de Google Resonance Audio (Web Audio nativo ultra optimizado) con degradación elegante a paneo estéreo si el dispositivo no soporta HRTF completo. |
| **Pérdida de memoria en manuscritos de 200+ páginas** | Media | Alto | Implementación de **Graph RAG local embebido**: el agente no depende de la ventana de contexto pura; consulta entidades y aristas en SQLite. |
| **Rechazo del mercado de escritores independientes** | Alto | Alto | Estrategia de 3 fases: no vender la herramienta de entrada; demostrar primero su éxito con la obra insignia propia y expandir luego hacia B2B/EdTech. |

---

## 5. Criterios de Éxito y Métricas Clave (KPIs)

1. **Rendimiento del Compilador:** Binarios compilados en menos de 90 segundos con un peso menor a 20 MB (sin contar assets pesados).
2. **Latencia del Entorno de Co-dirección:** Modificaciones aprobadas en el chat se reflejan en el Live Preview en menos de 200 ms.
3. **Fidelidad Psicoacústica:** En pruebas a ciegas con auriculares, más del 90% de los usuarios identifican con precisión si una fuente de audio se encuentra delante, detrás, a la izquierda o a la derecha.
4. **Validación Comercial de la Obra Insignia:** Alcanzar una valoración mayor al 85% positiva en Steam durante los primeros 3 meses de lanzamiento.

---
*Fin del Roadmap y Plan de Desarrollo de Ingeniería*
