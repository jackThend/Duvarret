# Documento de Requisitos de Producto (PRD)
## Proyecto: Duvarret — Director Agéntico de Literatura Polimórfica

**Versión:** 1.0.0  
**Fecha:** Septiembre 2026  
**Estado:** Aprobado / Especificación Base  
**Audiencia:** Equipo de Desarrollo, Diseñadores de UI/UX, Autores y Artistas Co-directores  

---

## 1. Visión y Propósito del Producto

### 1.1 Resumen Ejecutivo
**Duvarret** es una estación de trabajo de autoría y compilador de narrativa interactiva de próxima generación. Su propósito es **desacoplar el texto literario (novelas, relatos, ensayos, divulgación) de su formato estático tradicional**, permitiendo transformar manuscritos en experiencias interactivas y multisensoriales ejecutables (.exe nativo, Web/PWA, o Audio-drama puro).

A diferencia de los motores de juego tradicionales que exigen programar (Unity, Godot, Ren'Py) o de las herramientas de autoría manual basadas en hipertexto (Twine, Ink), Duvarret incorpora un **Agente Director Dramatúrgico** que actúa como co-director, diseñador de interacción y puente técnico invisible. 

El autor nunca escribe código ni lidia con la complejidad técnica; trabaja en una interfaz elegante y minimalista pensada para artistas, con un procesador de texto enriquecido, un diálogo interactivo con el agente y una **vista previa dividida en tiempo real (split-view)**.

### 1.2 Declaración de Misión
Democratizar la creación de literatura ergódica, videojuegos narrativos y ficción sonora inmersiva, proporcionando a escritores y artistas una herramienta que convierte la prosa en software ejecutable sin fricción técnica, garantizando soberanía de datos, portabilidad local y fidelidad artística absoluta.

### 1.3 Principios Rectores de Diseño
1. **Complejidad Cero para el Creador:** El artista nunca ve CSS, WebGL, shaders, scripts de variables ni configuración de compilación. Toda la complejidad la gestiona el agente y el runtime declarativo.
2. **Arquitectura Declarativa Anti-Alucinación:** El agente **nunca genera código ejecutable improvisado al vuelo** (lo que genera "código espagueti" y fallos catastróficos). El agente solo interpreta y emite directivas dentro de un esquema estricto y precompilado (`story_manifest.json`).
3. **Estación de Trabajo Unificada en Split-View:** Escritura, dirección asistida y previsualización viva conviven en una interfaz armónica y estética, diseñada bajo cánones editoriales para no abrumar al artista.
4. **Soberanía y Filosofía Offline-First:** Los proyectos son paquetes locales (`.duvarret`) con bases de conocimiento en grafos semánticos locales embebidos. El creador es dueño de sus datos y puede trabajar completamente desconectado si utiliza modelos locales.
5. **Agnosticismo Total de IA:** Compatibilidad universal mediante llamadas a herramientas estándar (*tool calling*) para cualquier proveedor (Google Gemini, Anthropic Claude, OpenAI o modelos locales vía Ollama/vLLM).

---

## 2. Usuarios y Personas (Target Audience)

### Persona 1: Elena — La Novelista / Escritora Creativa
* **Perfil:** Autora de ficción con libros publicados o en proceso. No sabe programar ni le interesa aprender C#, GDScript o Python.
* **Necesidad:** Desea que su novela no sea solo hojas de papel o un e-pub frío. Quiere que en las escenas tensas el texto transmita claustrofobia, que los diálogos cobren vida visual y que haya bifurcaciones sutiles sin convertirse en desarrolladora de software.
* **Uso de Duvarret:** Usa el *Modo Injerto* o *Modo Exégesis*, conversa con el agente sobre el tono de sus capítulos y observa cómo su texto se transforma visualmente en el panel contiguo.

### Persona 2: Lucas — El Diseñador Narrativo Indie
* **Perfil:** Guionista de juegos y narrativas interactivas. Conoce Twine o Ren'Py pero se siente frustrado por la rigidez visual de las cajas de diálogo estándar y la lentitud de configurar variables manuales.
* **Necesidad:** Crear experiencias narrativas complejas estilo *Disco Elysium*, *Device 6* o *Stories Untold*, con mecánicas de dados, inventarios y minijuegos de terminal sin lidiar con motores pesados.
* **Uso de Duvarret:** Utiliza el *Modo Taller*, aprovecha las mecánicas de rol nativas de Duvarret y ensambla ejecutables nativos ultra ligeros (< 20 MB) para publicar en Steam o itch.io.

### Persona 3: Mateo — El Divulgador / Creador Académico
* **Perfil:** Investigador, docente o ensayista. Genera documentos densos, biografías históricas o papers científicos.
* **Necesidad:** Transformar textos complejos en experiencias dinámicas, interactivas y digeribles (EdTech) para museos, universidades o distribución digital.
* **Uso de Duvarret:** Ingesta ensayos completos, activa mapas interactivos, notas marginales vivas, gráficos reactivos y simulaciones de escritorio.

### Persona 4: Sofía — Diseñadora de Audio-Ficción y Accesibilidad
* **Perfil:** Guionista de podcasts de ficción y activista de accesibilidad para la comunidad ciega.
* **Necesidad:** Producir obras donde la inmersión no dependa de gráficos, sino de un espacio sonoro 3D creíble con física psicoacústica real y ramificación de decisiones sin pantalla.
* **Uso de Duvarret:** Configura el *Extremo B (Audio-Drama Binaural)*, sube pistas de foley y voces, y ubica eventos sonoros espacialmente mediante instrucciones al agente ("el carruaje pasa por la izquierda a 4 metros").

---

## 3. Requisitos Funcionales (RF)

### Módulo 1: Ingesta, Análisis y Modos de Trabajo Autor-Agente

#### RF-01: Ingesta Multiformato y Deconstrucción de Manuscritos
* El sistema debe permitir la carga directa de archivos en formato `.pdf`, `.docx`, `.epub`, `.md` y `.txt`.
* El agente debe realizar un *Scene Parsing* (segmentación semántica) dividiendo la obra en unidades dramáticas o *beats* de entre 300 y 800 palabras, respetando la estructura de capítulos y escenas.
* Para cada beat, el agente debe analizar automáticamente:
  * Tono emocional y espacialidad (intimidad, claustrofobia, peligro, solemnidad, humor).
  * Candidatura de interacción (diálogo puro, monólogo reflexivo, enigma/puzle, interacción con aparatos/monitores).

#### RF-02: Tres Modos de Colaboración Autor-Agente
* **Modo Exégesis (Deconstrucción de Clásicos / Obras Completas):**
  * Ingesta de textos íntegros (ej. *Don Quijote*, *Frankenstein*).
  * El agente propone intervenciones dramatúrgicas progresivas escena por escena (ej.: transformar una discusión en un careo de novela visual o un pasaje de persecución en texto cinemático acelerado).
* **Modo Injerto (Continuación Co-creativa):**
  * El autor sube capítulos iniciales de una obra en desarrollo.
  * El agente extrae el glosario, el perfil de personajes, el léxico, la métrica estilística y las reglas del universo literario.
  * A partir del punto de corte, el agente asiste en la co-escritura, sugiere ramificaciones y construye la interactividad en paralelo.
* **Modo Taller (Lienzo en Blanco):**
  * Creación desde cero guiada por diálogo socrático.
  * El autor plantea ideas desestructuradas y el agente ayuda a modelar la escaleta, los nodos de decisión y las directivas multimedia.

---

### Módulo 2: Cerebro Narrativo y Grafo Semántico Local (Graph RAG)

#### RF-03: Grafo Semántico de Conocimiento Embebido
* Duvarret debe almacenar toda la estructura ontológica de la obra en una base de datos local embebida (ej. SQLite con extensiones relacionales/JSON/FTS5 o motor de grafo local) sin dependencias de servidores en la nube.
* **Entidades del Grafo (Nodos):** Personajes, locaciones, objetos clave, facciones, misterios/pistas, estados psicológicos/emocionales y nodos de escena.
* **Relaciones Ponderadas (Aristas):** Vínculos interpersonales (afinidad, lealtad, desconfianza), líneas de causalidad temporal, dependencias de requisitos y banderas lógicas (*flags* de estado).

#### RF-04: Supervisión Activa de Continuidad Ontológica
* El agente debe consultar el grafo antes de aprobar o proponer cualquier evento narrativo.
* Detección preventiva de inconsistencias: si el autor intenta reintroducir un objeto previamente destruido, contradice el paradero de un personaje o viola una regla del mundo, el agente debe intervenir proactivamente advirtiendo la contradicción y proponiendo soluciones.
* El autor debe tener acceso a un visor visual interactivo del grafo para explorar nodos, podar ramas o inspeccionar el estado del lore en cualquier momento.

---

### Módulo 3: El Espectro Polimórfico de Salida

Duvarret debe permitir modular la densidad multimedia e interactiva desde el 0% hasta el 100%, pudiendo alternar fluidamente entre los siguientes estilos dentro de una misma obra:

#### RF-05: Nivel Libro Aumentado e Ilustrado (Lectura Contemplativa)
* Diagramación editorial limpia, tipografía con ritmo de página tradicional.
* Anclaje de ilustraciones contextuales a pantalla completa, cabecera o viñetas marginales.
* Notas interactivas al pie y glosarios emergentes sin romper la lectura.
* Iluminación ambiental reactiva según la hora ficticia del relato (modo día, noche, luz de vela).

#### RF-06: Nivel Literatura Ergódica y Tipografía Reactiva
* El texto físico se convierte en un actor visual dinámico mediante Canvas / Shaders CSS:
  * **Deformación de caja:** El margen de la columna se estrecha progresivamente cuando el personaje recorre espacios angostos.
  * **Degradación tipográfica:** Las letras tiemblan, se dispersan, sufren efecto *glitch* o se "derriten" verticalmente cuando decae la cordura o la estabilidad del protagonista.
  * **Iluminación dinámica:** Párrafos que permanecen a oscuras hasta que el cursor del ratón o el dedo del lector actúa como una linterna direccional.
  * **Física textual:** Palabras o letras que caen por gravedad, flotan en gravedad cero o se invierten especularmente.

#### RF-07: Nivel Novela Visual Integrada
* Conmutación automática en pasajes dialógicos hacia una interfaz cinemática.
* Despliegue de retratos/avatares (sprites) con expresiones emocionales variables.
* Cajas de diálogo estilizadas con efecto máquina de escribir configurable.
* Historial de diálogo (*backlog*), registro de citas y opciones de ramificación dialógica.

#### RF-08: Nivel Sistemas RPG Narrativo (Inspirado en *Narrat* / *Disco Elysium*)
* Hojas de personaje visibles o invisibles (atributos, rasgos de personalidad, estados de ánimo).
* Chequeos de habilidad pasivos (ocultos en el texto, revelando matices según la percepción del personaje) o activos (tiradas de dados con probabilidades explícitas).
* Sistema de inventario contextual (inspección de objetos, combinación de pistas).
* Registro de misiones e hitos argumentales (*quest log*).

#### RF-09: Nivel Mundos Simulados y Minijuegos Embebidos
* **Terminales de comandos retro:** Emuladores CRT con fósforo verde/ámbar para simular consolas UNIX, comandos de hackeo o diarios de bitácora interactivos.
* **Escritorios de SO simulados:** Ventanas interactivas con navegador web ficticio, clientes de correo intervenidos y visor de archivos clasificados.
* **Micro-puzles contextuales:** Módulos web autocontenidos para resolver cerraduras de ganzúa, descifrar claves alfanuméricas o conectar cableados de circuitos.

#### RF-10: Nivel Audio-Drama Binaural Puro (Accesibilidad Ciega Universal)
* Posibilidad de desactivar el 100% de la interfaz gráfica para crear experiencias puramente acústicas.
* Narración por voz (sintetizada con inflexión emocional o grabaciones humanas).
* Foley y diseño sonoro tridimensional inmersivo.
* Control total accesible: comandos de voz en lenguaje natural, comandos hápticos o atajos de teclado compatibles con lectores de pantalla (NVDA, JAWS, VoiceOver).

---

### Módulo 4: Motor de Audio Espacial y Psicoacústica 3D

#### RF-11: Parametrización Espacial por Lenguaje Natural
* El agente debe interpretar instrucciones espaciales en lenguaje cotidiano dadas por el autor (ej.: *"el teléfono suena a la derecha a 3 metros"*, *"unos pasos se acercan por detrás"*).
* El agente debe traducir automáticamente estas indicaciones a coordenadas cartesianas relativas al oyente: $P = (x, y, z)$.

#### RF-12: Integración de Motores de Audio Espacial (Apache 2.0)
* **Google Resonance Audio SDK:** Integrado en el runtime Web / UI sobre Web Audio API para simulación de HRTF, cálculo de absorción de superficies (madera, metal, vidrio, hormigón) y atenuación de distancia en tiempo real.
* **Valve Steam Audio (vía WASM):** Pipeline avanzado para trazado de rayos acústicos (*ray tracing sonoro*), cálculo de oclusión física y reverberación convolutiva basada en la geometría de la sala.
* Soporte para paneo binaural con salida a auriculares estéreo estándar.

---

### Módulo 5: Agnosticismo de IA y Gestión Híbrida de Recursos

#### RF-13: Conectividad Multi-Proveedor de Modelos
* El sistema debe operar mediante adaptadores desacoplados basados en *Tool Calling* / llamadas a funciones.
* Compatibilidad nativa para que el usuario configure su propia clave de API:
  * Google Gemini (1.5 Pro / Flash con contexto de gran longitud).
  * Anthropic Claude (3.5 Sonnet).
  * OpenAI (GPT-4o).
  * Modelos locales de código abierto sin conexión a internet vía Ollama o vLLM (Llama 3, Mistral, Command-R).

#### RF-14: Gestión Híbrida de Assets (Humano + Sintético)
* **Carga Manual Directa:** El autor puede arrastrar y soltar sus propias ilustraciones, retratos, grabaciones de voz, efectos de sonido (SFX) o canciones completas.
* **Generación Sintética Integrada:** Si el proveedor configurado lo soporta o si se configuran APIs dedicadas (Gemini Multimodal, Flux, Stable Diffusion, ElevenLabs, Suno/Udio), el autor puede delegar al agente la creación directa de recursos respetando directrices de estilo predefinidas.
* **Catálogo de Procedencia:** El sistema debe etiquetar y registrar el origen de cada asset (autor original vs. sintético) con metadatos de autoría, derechos y coherencia visual.

---

### Módulo 6: Editor Integrado de Duvarret (UI/UX para Artistas)

#### RF-15: Arquitectura de la Interfaz Unificada (Tauri + Vue 3)
* El editor debe ejecutarse como una aplicación de escritorio unificada, rápida y con estética editorial sobria (estilo *iA Writer* cruzado con un DAW minimalista).
* **Layout Bipartito / Tripartito en Split-View en Tiempo Real:**
  1. **Lienzo de Escritura y Edición:** Espacio limpio de prosa enriquecida libre de distracciones.
  2. **Columna del Agente Co-Director:** Chat conversacional con el agente donde se discuten propuestas de adaptación, variaciones de trama y sugerencias mecánicas.
  3. **Visor de Previsualización en Vivo (Live Preview):** Renderizador inmediato de la escena actual en el runtime de Duvarret, permitiendo probar la tipografía dinámica, el audio espacial y los puzles exactamente como los experimentará el lector.
  4. **Panel Lateral Colapsable:** Inspector de inventario de assets y visualizador del grafo semántico.

---

### Módulo 7: Compilación y Exportación

#### RF-16: Emisión del Manifiesto Declarativo (`story_manifest.json`)
* El agente genera exclusivamente directivas declarativas estructuradas.
* El archivo de manifiesto describe: identificadores de nodo, texto procesado, propiedades del motor tipográfico, coordenadas de audio espacial, estados de juego requeridos, transiciones y componentes jugables asociados.

#### RF-17: Compilación Nativa a un Clic (Tauri / Rust)
* Duvarret debe empaquetar el manifiesto, los assets y el runtime precompilado en:
  * **Binario ejecutable nativo (.exe para Windows, AppImage/deb para Linux, .app para macOS):** Peso inferior a 20 MB, arranque instantáneo y mínimo consumo de RAM.
  * **Aplicación Web Estática / PWA:** Lista para desplegarse en servidores web, itch.io o plataformas independientes.
  * **Paquete de Audio-Drama Autocontenido:** Para distribución en plataformas accesibles.

---

## 4. Requisitos No Funcionales (RNF)

### 4.1 Rendimiento y Eficiencia
* **RNF-01 (Peso del Ejecutable):** El binario final generado por Tauri no debe superar los 25 MB (excluyendo assets multimedia pesados del usuario).
* **RNF-02 (Uso de Memoria RAM):** El runtime de reproducción debe operar de forma óptima con menos de 150 MB de memoria RAM en el dispositivo del usuario final.
* **RNF-03 (Latencia de Previsualización):** La actualización de la vista previa dividida en el editor debe ocurrir en menos de 200 ms tras la confirmación de cambios por parte del usuario o el agente.

### 4.2 Privacidad, Soberanía y Operación Offline
* **RNF-04 (Offline-First):** Toda la lógica de edición, persistencia en base de datos local y reproducción debe funcionar al 100% sin conexión a internet cuando se utilice un modelo de lenguaje local (vía Ollama).
* **RNF-05 (Almacenamiento Local Transparente):** Los proyectos de Duvarret se guardan como directorios legibles `.duvarret` que contienen el manifiesto JSON, la base de datos de grafos local y la carpeta de assets, facilitando backups y control de versiones con Git.

### 4.3 Accesibilidad Universal
* **RNF-06 (Conformidad WCAG):** En modo de lectura visual, el sistema debe cumplir con el nivel WCAG 2.1 AA (contraste tipográfico adaptable, escalado de fuente).
* **RNF-07 (Accesibilidad Sonora Total):** En modo sin pantalla, el 100% de las funciones de navegación, inventario y toma de decisiones deben ser operables mediante lectores de pantalla estándar (NVDA/JAWS/VoiceOver) o síntesis y reconocimiento de voz integrado.

### 4.4 Seguridad y Estabilidad
* **RNF-08 (Aislamiento de Componentes):** Los minijuegos y componentes interactivos se ejecutan en sandboxes aislados dentro del runtime de Vue 3, imposibilitando que un puzle mal configurado rompa el estado global de la historia.
* **RNF-09 (Resiliencia ante Alucinaciones):** Si el agente genera una coordenada acústica o una directiva tipográfica no contemplada en el esquema, el validador del manifiesto aplica valores por defecto seguros sin abortar la ejecución.

---

## 5. Estrategia de Negocio y Ciclo de Vida del Producto

Para garantizar el éxito comercial y evitar el riesgo clásico de software de autoría sin demanda, Duvarret adopta una estrategia de tres fases:

```
┌───────────────────────────────────────────────────────────┐
│ FASE 1: Dogfooding y Obra Insignia                        │
│ Publicar 1-2 obras maestras en Steam/itch.io ($3 - $8)    │
│ Objetivo: Crear la demanda cultural del formato.          │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│ FASE 2: Expansión B2B y EdTech                            │
│ Adaptaciones para museos, divulgación científica y papers │
│ Objetivo: Generación de caja y validación institucional.  │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│ FASE 3: Ecosistema Editorial y Marketplace                │
│ Apertura de la herramienta a creadores externos           │
│ Monetización vía Revenue-Share y distribución global.     │
└───────────────────────────────────────────────────────────┘
```

---

## 6. Criterios de Aceptación del Producto (Definition of Done)

1. Un autor puede importar un relato de 10 páginas en PDF, dialogar con el agente para configurar 2 escenas de literatura ergódica, 1 diálogo con avatares y 1 evento de audio 3D posicional, y generar un ejecutable `.exe` nativo en menos de 10 minutos.
2. El archivo `.exe` compilado pesa menos de 20 MB más assets, arranca en menos de 1 segundo y reproduce con precisión espacial el audio posicionado a través de auriculares.
3. El editor mantiene un historial coherente de personajes y eventos gracias al grafo semántico embebido, alertando si se intenta cometer un error de continuidad narrativa.
4. El creador puede trabajar 100% desconectado de internet utilizando Ollama como backend local de IA.

---
*Fin del Documento de Requisitos de Producto (PRD)*
