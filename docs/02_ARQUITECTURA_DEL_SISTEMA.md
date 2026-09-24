# Documento de Arquitectura de Software y Sistema (ADD)
## Proyecto: Duvarret — Director Agéntico de Literatura Polimórfica

**Versión:** 1.0.0  
**Fecha:** Septiembre 2026  
**Estado:** Aprobado / Especificación de Ingeniería  
**Alcance:** Arquitectura técnica global, subsistemas, componentes, flujo de datos y modelo de compilación.

---

## 1. Visión General de la Arquitectura

Duvarret está diseñado bajo el patrón **Arquitectura Declarativa Desacoplada**. Se compone de dos entornos bien diferenciados pero estrechamente integrados:

1. **Estación de Trabajo del Creador (Duvarret Studio):** Una aplicación de escritorio nativa basada en **Tauri v2 + Vue 3**, que integra un editor de texto enriquecido, un orquestador agéntico multi-proveedor, un visor de grafo semántico embebido y un panel de **previsualización dividida en tiempo real (Split-View Live Preview)**.
2. **Reproductor Universal de Narrativa (Duvarret Runtime):** Un motor de ejecución ligero, determinista y de alto rendimiento que lee e interpreta un manifiesto declarativo estandarizado (`story_manifest.json`). Este runtime se embebe dentro del editor para la vista previa y se compila de forma aislada en el binario final de distribución (.exe / Web / Audio-drama) sin arrastrar la sobrecarga del editor ni de los modelos de IA.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        DUVARRET STUDIO (Tauri v2 + Vue 3)                              │
│                                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────────┐  │
│  │   Lienzo de Escritura │  │   Agente Co-Director   │  │   Live Preview (Runtime)   │  │
│  │   (Prosa Enriquecida) │  │   (Chat & Propuestas) │  │   (Vue 3 + Shaders + Audio)    │  │
│  └───────────┬───────────┘  └───────────┬───────────┘  └─────────────▲──────────────┘  │
│              │                          │                            │                 │
│              ▼                          ▼                            │                 │
│  ┌──────────────────────────────────────────────────┐                │                 │
│  │     Orquestador Agéntico & Tool Calling Bus      │                │                 │
│  └───────────┬──────────────────────────┬───────────┘                │                 │
│              │                          │                            │                 │
│              ▼                          ▼                            │                 │
│  ┌───────────────────────┐  ┌───────────────────────┐                │                 │
│  │   Cerebro Semántico   │  │  Compilador Interno   │────────────────┘                 │
│  │ (Grafo Local Embebido)│  │ (story_manifest.json) │                                  │
│  └───────────────────────┘  └───────────┬───────────┘                                  │
└─────────────────────────────────────────┼──────────────────────────────────────────────┘
                                          │
                                          ▼ Compilación a un Clic (Tauri CLI)
                              ┌───────────────────────┐
                              │  EJECUTABLE FINAL     │
                              │  (.exe / Web / PWA)   │
                              │  < 20 MB Nativo       │
                              └───────────────────────┘
```

---

## 2. Pila Tecnológica (Tech Stack)

| Capa | Tecnología | Justificación Técnica |
| :--- | :--- | :--- |
| **Shell de Escritorio** | **Tauri v2 (Rust)** | Binarios nativos de menos de 20 MB, uso de RAM inferior a 150 MB (frente a los >150 MB de Electron), acceso seguro al sistema de archivos local y compilación cruzada. |
| **Frontend del Editor** | **Vue 3 + TypeScript + Vite** | Reactividad granular mediante *Composition API*, rendimiento de renderizado excepcional y arquitectura modular idónea para split-view. |
| **Gestión de Estado** | **Pinia Store** | Estado centralizado determinista; permite que la máquina virtual de la historia responda a eventos del editor en menos de 200 ms. |
| **Renderizado Tipográfico** | **CSS Shaders + PixiJS** | Deformaciones de malla de texto, licuado, degradación y efectos de linterna ejecutados por GPU en WebGL sin sobrecargar la CPU. |
| **Audio Espacial 3D** | **Google Resonance Audio SDK** + **Steam Audio WASM** | Licencia Apache 2.0 comercial. Filtros HRTF, modelado de materiales de salas acústicas, oclusión y reverberación física sobre Web Audio API. |
| **Cerebro Semántico Local** | **SQLite (FTS5 + JSON1) / KùzuDB** | Base de datos embebida local, portable, sin dependencias de red, almacena la ontología, personajes, estados y causalidad del manuscrito. |
| **Conectividad de IA** | **Adaptador Agnóstico (OpenAI Schema)** | Compatible con Gemini 1.5 Pro/Flash, Claude 3.5 Sonnet, GPT-4o y modelos locales sin internet mediante Ollama / vLLM. |

---

## 3. Estructura de Proyecto y Archivo `.duvarret`

Cada obra creada en Duvarret es un directorio autocontenido con extensión `.duvarret`, garantizando soberanía de datos, portabilidad total y compatibilidad nativa con sistemas de control de versiones como Git:

```
Mi_Novela.duvarret/
│
├── project.duvarret.json       # Metadatos del proyecto (título, autor, modo activo, API configs)
│
├── manuscript/
│   ├── raw/                    # Textos originales importados (.pdf, .docx, .md)
│   └── beats/                  # Fragmentos procesados por el Scene Parser
│
├── knowledge/
│   └── lore_graph.db           # Grafo de conocimiento embebido (SQLite/Kùzu)
│
├── manifest/
│   └── story_manifest.json     # Manifiesto declarativo compilado que lee el runtime
│
├── assets/
│   ├── audio/                  # Pistas Foley, música ambiental, locuciones
│   │   └── registry.json       # Metadatos espaciales y procedencia (humano vs IA)
│   ├── images/                 # Retratos, fondos, viñetas, portadas
│   └── typography/             # Fuentes vectoriales y efectos personalizados
│
└── export/                     # Salidas de compilación (.exe, web build, audio bundle)
```

---

## 4. Subsistemas de la Estación de Trabajo (Duvarret Studio)

### 4.1 Layout Split-View en Tiempo Real (Diseñado para Artistas)
La interfaz evita el desorden de los motores de juego tradicionales y adopta una disposición tripartita armónica con temática editorial:

```
┌─────────────────┬──────────────────────────┬──────────────────────────┐
│  ÁRBOL / GRAFO  │   LIENZO DE ESCRITURA    │     PREVISUALIZACIÓN     │
│   (Colapsable)  │   (Prosa Enriquecida)    │    EN VIVO (RUNTIME)     │
│                 │                          │                          │
│ Cap. 1: Inicio  │ El pasillo se angostaba  │                          │
│ ├─ Escena 1 (A) │ a cada paso. Las paredes │  El pasillo se angostaba │
│ └─ Escena 2 (B) │ de piedra parecían       │    a cada paso. Las      │
│                 │ exhalar humedad helada.  │    paredes de piedra     │
│ Personajes (4)  │                          │    parecían exhalar...   │
│ Objetos (3)     │ [Sugerencia del Agente]  │                          │
│                 │ ¿Deseas comprimir el     │  [Audio 3D: Gotera a     │
│                 │ margen del texto y ubicar│   (x: 2, y: 0, z: -3)]   │
│                 │ una gotera a la derecha? │                          │
│                 ├──────────────────────────┤                          │
│                 │  CHAT DEL CO-DIRECTOR    │                          │
│                 │  "Aprobado, genera la    │                          │
│                 │   gotera en 3D".         │                          │
└─────────────────┴──────────────────────────┴──────────────────────────┘
```

* **Lienzo de Escritura:** Procesador tipo *focus-mode* libre de ruido visual, con soporte para bloques narrativos, diálogos y notas marginales.
* **Agente Co-Director:** Consola conversacional contextual anclada al beat actual. Muestra propuestas mediante tarjetas interactivas (Aceptar / Ajustar / Rechazar).
* **Previsualización en Vivo:** Instancia reactiva del **Duvarret Runtime**. Cualquier directiva aprobada recompila el nodo en memoria y refresca la vista en menos de 200 ms.
* **Panel de Lore / Grafo:** Visualizador de nodos interconectados que permite al autor ver la red de relaciones entre personajes, pistas y eventos.

---

### 4.2 Orquestador Agéntico y Bus de Herramientas (Tool Calling)

El agente opera como un motor desacoplado que interactúa con la estación de trabajo exclusivamente a través de llamadas a herramientas estandarizadas (*function calling*). Esto garantiza que el "cerebro" pueda sustituirse por cualquier modelo (Gemini, Claude, GPT o un modelo local vía Ollama) sin alterar el funcionamiento del software.

#### Herramientas Nucleares del Agente Director:

```typescript
// Definición del set de herramientas que el agente puede invocar

interface AgentToolRegistry {
  // 1. Consulta y actualización del cerebro semántico
  queryLoreGraph(params: { entity: string; relation_type?: string }): Promise<LoreEntity[]>;
  updateLoreEntity(params: { entity_id: string; attributes: Record<string, any> }): Promise<boolean>;
  validateContinuity(params: { proposed_action: string; target_nodes: string[] }): Promise<ValidationResult>;

  // 2. Modulación del espectro polimórfico en el manifiesto
  setTypographicEffect(params: {
    node_id: string;
    effect_type: "narrow_corridor" | "melt_text" | "heartbeat_tremor" | "flashlight_mask" | "physics_fall";
    parameters: Record<string, any>;
  }): Promise<void>;

  setVisualNovelSegment(params: {
    node_id: string;
    speakers: { character_id: string; mood: string; sprite_url: string }[];
    dialogue_tree: DialogueBranch[];
  }): Promise<void>;

  mountSimulatedModule(params: {
    node_id: string;
    module_type: "crt_terminal" | "fictional_desktop" | "circuit_puzzle" | "cipher_lock";
    config: Record<string, any>;
  }): Promise<void>;

  // 3. Audio espacial y psicoacústica 3D
  placeSpatialAudio(params: {
    node_id: string;
    asset_path: string;
    coordinates: { x: number; y: number; z: number }; // Coordenadas relativas al oyente en metros
    room_preset: "small_room" | "narrow_corridor" | "cave" | "large_vault" | "outdoor";
    acoustic_material: "stone" | "wood" | "metal" | "glass";
    trigger_event: "on_enter" | "on_text_reveal" | "on_interaction";
  }): Promise<void>;

  // 4. Gestión de assets híbridos
  requestAssetSynthesis(params: {
    type: "portrait" | "background" | "sfx" | "voice";
    prompt: string;
    style_preset: string;
  }): Promise<AssetHandle>;
}
```

---

### 4.3 Cerebro Semántico: Grafo de Conocimiento Local Embebido (Graph RAG)

Para garantizar la coherencia ontológica en obras de gran extensión y permitir el trabajo 100% desconectado, Duvarret prescinde de servicios vectoriales externos en la nube y ejecuta un motor de grafo embebido sobre SQLite con soporte de JSON relacional y búsqueda de texto completo (FTS5).

#### Esquema de Datos del Grafo:

```
┌──────────────────────┐              ┌───────────────────────────┐
│     NODOS (Nodes)    │              │       ARISTAS (Edges)     │
├──────────────────────┤              ├───────────────────────────┤
│ id (TEXT PRIMARY KEY)│◄─────────────┤ source_node_id (TEXT)     │
│ category (TEXT)      │              │ target_node_id (TEXT)     │
│ name (TEXT)          │─────────────►│ relationship (TEXT)       │
│ attributes (JSON)    │              │ weight (FLOAT)            │
│ status_flags (JSON)  │              │ timeline_timestamp (INT)  │
│ created_in_beat (INT)│              │ properties (JSON)         │
└──────────────────────┘              └───────────────────────────┘
```

* **Supervisión de Continuidad Activa:** Cuando el autor introduce un acontecimiento que contradice el estado guardado (por ejemplo, el autor redacta *"Pedro extrajo el revólver de su abrigo"*, pero en el nodo anterior el revólver fue confiscado en la comisaría), el orquestador ejecuta una consulta al grafo y alerta preventivamente al autor en la columna de co-dirección con sugerencias de ajuste.

---

## 5. Subsistemas del Reproductor Universal (Duvarret Runtime)

El Runtime es el motor determinista que se encarga de renderizar la obra sin depender de ningún LLM.

### 5.1 Motor de Renderizado Tipográfico y Ergódico
* **Pipeline de Estilos Dinámicos:** Utiliza variables reactivas CSS y contenedores flexibles para estrechar columnas de lectura en pasillos o comprimir márgenes.
* **Capa WebGL (PixiJS / Shaders):**
  * *Shader de Licuado/Fusión:* Aplica un mapa de desplazamiento para simular que el texto "se derrite" ante eventos de locura o calor.
  * *Shader de Temblores (Jitter):* Modula la posición de los vértices de las letras siguiendo una onda senoidal sincronizada con el pulso cardíaco del personaje.
  * *Máscara Dinámica de Linterna:* Una capa negra superpuesta al texto que se vuelve transparente de forma radial siguiendo las coordenadas del ratón o el dedo táctil, con atenuación suave en los bordes.

### 5.2 Motor de Audio Espacial y Psicoacústica 3D
El motor de audio se basa en **Google Resonance Audio SDK** (Web Audio API) y componentes WASM de **Steam Audio**:

```
                       [Entrada de Audio (WAV/OGG/MP3)]
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │  Resonance Audio SourceNode │
                      └──────────────┬──────────────┘
                                     │
                 ┌───────────────────┼───────────────────┐
                 │                   │                   │
                 ▼                   ▼                   ▼
       ┌──────────────────┐ ┌──────────────────┐ ┌────────────────┐
       │ Posicionamiento  │ │   Atenuación     │ │   Oclusión     │
       │ Cartesiano 3D    │ │   Logarítmica    │ │  y Materiales  │
       │ P = (x, y, z)    │ │   por Distancia  │ │  (Filtros FIR) │
       └─────────┬────────┘ └────────┬─────────┘ └────────┬───────┘
                 │                   │                    │
                 └───────────────────┼────────────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │  Filtro HRTF Binaural       │
                      │  (Percepción de oreja 3D)   │
                      └──────────────┬──────────────┘
                                     │
                                     ▼
                        [Salida Estéreo Auriculares]
```

* **Cálculo de Coordenadas:**  
  * Eje $X$: Izquierda (-X) a Derecha (+X).  
  * Eje $Y$: Abajo (-Y) a Arriba (+Y).  
  * Eje $Z$: Atrás (-Z) a Adelante (+Z).  
  * *Ejemplo:* Si el autor define *"un trueno resuena arriba a la izquierda y atrás"*, las coordenadas se asignan como $P = (-4.0, 5.0, -8.0)$.
* **Modo Sin Pantalla (100% Acústico para Ciegos):** El runtime desactiva el renderizador visual de Vue y conmuta a un bucle auditivo donde los cambios de beat se anuncian por voz y foley 3D, y las elecciones de ramificación se resuelven mediante teclado numérico, comandos de voz o atajos universales accesibles.

### 5.3 Máquina de Estados y Módulos de Minijuegos
* Inspirado en la arquitectura modular de **Narrat**, el estado del juego reside en un store reactivo de **Pinia**.
* **Sandboxing de Puzles:** Los minijuegos (terminales de comandos, ganzúas, puzles de circuitos) son componentes Vue autocontenidos. Reciben sus condiciones de inicio y devuelven únicamente una señal de éxito o fracaso (`on_success` / `on_fail`), garantizando que un fallo dentro de un minijuego nunca desestabilice el flujo de la lectura principal.

---

## 6. Pipeline de Compilación y Exportación

El creador no necesita configurar compiladores ni entornos de desarrollo. El compilador de Duvarret automatiza todo el proceso a través de **Tauri CLI**:

```
[Directorio del Proyecto (.duvarret)]
               │
               ▼
┌──────────────────────────────────────────────┐
│  Compilador Interno de Duvarret              │
│  1. Valida el story_manifest.json            │
│  2. Optimiza assets (WebP / Ogg compresos)   │
│  3. Inyecta el manifiesto en el Runtime Base │
│  4. Configura tauri.conf.json                │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Tauri Build Engine (Rust Backend)           │
│  - Enlaza el WebView nativo del sistema      │
│  - Compila binario optimizado con LTO        │
│  - Firma digitalmente el paquete             │
└──────────────────────┬───────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
┌──────────────┐┌──────────────┐┌──────────────┐
│ .exe Nativo  ││ Web / PWA    ││ Audio-Drama  │
│ (Windows)    ││ (HTML5/Vite) ││ Autocontenido│
│ < 20 MB      ││ Listo p/Web  ││ Accesible    │
└──────────────┘└──────────────┘└──────────────┘
```

### Ventajas Técnicas del Binario Final:
* **Tamaño Reducido:** Menos de 20 MB de peso base (frente a los >150 MB habituales de Electron).
* **Consumo de Memoria:** Menos de 150 MB de memoria RAM durante la ejecución.
* **Seguridad:** El código y los manifiestos quedan empaquetados dentro del binario sin exponer archivos de scripts vulnerables.
* **Independencia Total:** El ejecutable final funciona 100% offline y no requiere conexión con servidores ni proveedores de IA.

---

## 7. Criterios de Rendimiento y Calidad de la Arquitectura

1. **Tiempo de Respuesta del Live Preview:** Menor a 200 ms entre la aprobación de una sugerencia en el editor y su representación visual/acústica en el visor.
2. **Latencia del Audio Espacial:** Inferior a 20 ms en la colocación y disparo de efectos acústicos sobre Web Audio API.
3. **Estabilidad del Grafo Semántico:** Consultas de validación de continuidad en menos de 50 ms para manuscritos con más de 1.000 entidades y 5.000 aristas.
4. **Determinismo:** El mismo `story_manifest.json` produce exactamente la misma experiencia en Windows, macOS, Linux y Web.

---
*Fin del Documento de Arquitectura de Software y Sistema (ADD)*
