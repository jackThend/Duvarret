# Especificación de Diseño UI/UX: Duvarret Studio
## Interfaz de Co-creación y Edición para Artistas

**Versión:** 1.0.0  
**Fecha:** Septiembre 2026  
**Público Objetivo:** Diseñadores UI/UX, Desarrolladores Frontend y Artistas Co-directores  
**Enfoque de Diseño:** *Zen Editorial + Escenario Interactivo Vivo*

---

## 1. Filosofía de Experiencia de Usuario (UX)

Duvarret Studio está concebido desde sus cimientos para **escritores, novelistas, poetas y artistas narrativos**, no para programadores ni ingenieros de software. 

### Principios Fundamentales:
1. **Cero Fricción Técnica (No Dev Jargon):** Quedan terminantemente prohibidos en la interfaz términos como "Raymarching", "Shader pipeline", "JSON parse error", "Entity-Component-System" o "HRTF Convolution". La interfaz habla el lenguaje de la literatura y la dramaturgia: *Tono, Ritmo, Tensión, Atmósfera, Eco, Presencia y Diálogo*.
2. **Lo que Ves es lo que Juegas (True WYSIWYG Split-View):** Cada modificación en el texto o sugerencia aprobada del agente se refleja de inmediato en el visor interactivo en tiempo real (< 200 ms). El creador nunca trabaja a ciegas.
3. **Calma Visual y Modo Enfoque:** Tipografía de máxima legibilidad, contrastes amables, paleta editorial inspirada en libros encuadernados y papel japonés, con transiciones orgánicas y libres de destellos estridentes.
4. **Respeto a la Soberanía Creativa:** El agente es un *co-director asesor*, no un reemplazo del autor. Sugiere, inspira y ejecuta la técnica, pero el autor siempre tiene la última palabra.

---

## 2. Disposición Espacial de la Pantalla (Workspace Layout)

Duvarret Studio organiza su espacio de trabajo en una estructura tripartita armónica con proporciones áureas:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [≡] DUVARRET STUDIO  ─  "El Laberinto de la Mancha"   [ Modo: Injerto ]   [ ⚙ ] [ ▶ Exportar ]   │
├─────────────────┬───────────────────────────────────────────────┬────────────────────────────────┤
│ NAVEGACIÓN Y    │            LIENZO DE ESCRITURA                │        PREVISUALIZACIÓN        │
│ CEREBRO (LORE)  │           Y CO-DIRECCIÓN VIVA                 │       EN VIVO (RUNTIME)        │
│ (20% ancho)     │               (45% ancho)                     │          (35% ancho)           │
├─────────────────┼───────────────────────────────────────────────┼────────────────────────────────┤
│ ▾ Cap. II: Sima │ # Escena 4: El Pasillo de las Goteras         │ ┌────────────────────────────┐ │
│   • Beat 1: Eco │                                               │ │                            │ │
│   • Beat 2: [★] │ El eco de las gotas de condensación rebotaba  │ │   El eco de las gotas de   │ │
│   • Beat 3: Luz │ contra las láminas de acero. El pasadizo se   │ │   condensación rebotaba    │ │
│                 │ volvió tan angosto que apenas podía respirar. │ │   contra las láminas...    │ │
│ ▾ Personajes    │                                               │ │                            │ │
│   • Don Quijote │ ┌───────────────────────────────────────────┐ │ │  [Radar Acústico 3D]       │ │
│   • Sancho (2)  │ │ ✦ Propuesta del Agente Director           │ │ │          (▲ Oyente)      │ │
│                 │ │ He detectado claustrofobia creciente.     │ │ │       • Gotera (3m der)  │ │
│ ▾ Inventario    │ │ ¿Deseas comprimir el texto y ubicar el    │ │ │                          │ │
│   • Llave [OK]  │ │ sonido de la gotera a 3.5m a la derecha?  │ │ └────────────────────────────┘ │
│                 │ │                                           │ │ ▶ Reproducir desde aquí      │ │
│ ▾ Grafo Semánt. │ │ [ Aplicar ]  [ Ajustar ]  [ Descartar ]   │ │ 🎧 Modo 100% Audio / Ciego   │ │
│   [Abrir Mapa]  │ └───────────────────────────────────────────┘ │ │ 📱 Probar en Formato Móvil │ │
│                 │                                               │ └────────────────────────────┘ │
└─────────────────┴───────────────────────────────────────────────┴────────────────────────────────┘
```

---

## 3. Descripción de los Tres Paneles Principales

### 3.1 Panel Izquierdo: Estructura Narrativa e Inspector de Lore (20%)
* **Árbol de Beats:** Muestra capítulos, escenas y unidades dramáticas con iconos sutiles que indican su formato activo (📖 Texto tradicional, 🌀 Ergódico, 🎭 Novela visual, 🕹️ Minijuego, 🎧 Audio binaural).
* **Directorio de Personajes y Objetos:** Lista viva de entidades detectadas en el manuscrito. Al hacer clic en un personaje (ej. *Sancho*), se muestran sus estados emocionales y apariciones.
* **Acceso al Grafo Semántico:** Botón flotante para abrir una superposición gráfica estilo constelación (*Graph View*), donde el creador puede ver visualmente las conexiones entre misterios, objetos y personajes.

### 3.2 Panel Central: Lienzo de Escritura y Co-dirección (45%)
* **Procesador Tipográfico Libre de Distracciones:** Tipografía editorial (*Spectral* o *EB Garamond* para serifas de literatura clásica; *Inter* para literatura contemporánea).
* **Marcadores Fantasma (Ghost Markers):** Pequeñas marcas doradas y elegantes en el margen que señalan dónde hay un efecto tipográfico o un evento acústico sin ensuciar la prosa del texto.
* **Tarjetas de Dirección Agéntica (Directorial Pitch Cards):** En lugar de un chat genérico saturado de texto, el agente se comunica mediante tarjetas visuales elegantes:
  * Resumen del hallazgo dramático.
  * Botones de acción directa: **[Aplicar al Instante]**, **[Ajustar Parámetros]**, **[Ver Alternativa]**.
* **Barra de Entrada Natural:** El autor puede escribirle al agente en cualquier momento: *"Quiero que cuando lea esta frase, la música se corte en seco y se escuche una respiración en la oreja izquierda"*.

### 3.3 Panel Derecho: Previsualización en Vivo — Duvarret Runtime (35%)
* **Motor Interactivo Real:** No es una simulación estática; es el **mismo motor que irá en el ejecutable final**.
* **Prueba Táctil / Clics:** El autor puede interactuar con las opciones de diálogo, experimentar la linterna sobre el texto con el cursor y resolver el puzle en vivo.
* **Widget del Radar Psicoacústico 3D:** Un minimapa circular minimalista que representa la cabeza del oyente y proyecta las fuentes sonoras en el espacio tridimensional. Permite al autor arrastrar los puntos sonoros con el ratón para ajustar su posición si prefiere afinarlos manualmente.
* **Conmutador de Modo "Sin Pantalla" (Accesibilidad Ciega):** Un interruptor que apaga la pantalla del visor a negro total, activando la síntesis de voz y el paisaje sonoro 3D para que el autor pueda cerrar los ojos y evaluar la experiencia acústica con auriculares.

---

## 4. Paleta de Color y Lenguaje Visual

Para proteger la vista durante sesiones de escritura prolongadas, Duvarret ofrece tres temas cuidadosamente calibrados:

### Tema 1: "Tinta y Pergamino Nórdico" (Dark Mode por Defecto)
* **Fondo Principal:** `#0c0e12` (Negro pizarra profundo)
* **Paneles Elevados:** `#15181e` (Gris antracita suave)
* **Texto de Prosa:** `#e3e5e8` (Blanco hueso antirreflejo)
* **Acento Editorial / Oro Antiguo:** `#d97706` / `#f59e0b` (Dorado cálido para sugerencias aprobadas y audio)
* **Acento Místico / Puzles:** `#06b6d4` (Cian sutil para terminales y tecnología simulada)

### Tema 2: "Cuaderno de Manuscrito" (Warm Sepia Mode)
* **Fondo Principal:** `#f4eee1` (Papel japonés cálido)
* **Texto de Prosa:** `#2c2523` (Tinta café oscura)
* **Acento:** `#b45309` (Ámbar tostado)

---

## 5. Microinteracciones Clave

### 5.1 La Aprobación de una Escena (Instant Feedback)
1. El autor aprueba una sugerencia de audio espacial o de deformación de texto.
2. La tarjeta de propuesta emite un pulso suave color ámbar.
3. El visor derecho actualiza instantáneamente el texto y reposiciona las fuentes de sonido en el espacio binaural.
4. Un auricular conectado reproduce un suave "pop" espacial confirmando la ubicación acústica.

### 5.2 El Radar de Sonido Arrastrable
* Cuando el autor dice: *"Pon el grito atrás a 5 metros"*, el radar dibuja un punto rojo en $(x: 0, z: -5)$.
* Si el autor quiere moverlo un poco a la izquierda, simplemente arrastra el punto con el cursor; las coordenadas en el `story_manifest.json` se actualizan reactivamente sin escribir una cifra.

### 5.3 Alerta Preventiva de Continuidad (Supervisión del Grafo)
* Si el autor escribe que un personaje utiliza un arma destruida previamente:
  * El texto se subraya sutilmente con una línea ondulada color ámbar.
  * Aparece una nota al margen del agente:  
    > *"Nota de Continuidad: La llave de bronce quedó en el pozo en el Capítulo I. ¿Deseas justificar que la recuperó o prefieres usar la ganzúa que tiene en el inventario?"*

---

## 6. Accesibilidad de la Estación de Trabajo

* **Soporte Completo de Teclado:** Cada acción crítica (siguiente beat, aprobar propuesta, reproducir audio, conmutar vista previa) tiene atajos configurables accesibles con una mano.
* **Compatibilidad con Lectores de Pantalla:** Todo el editor y sus tarjetas agénticas están etiquetadas semánticamente con atributos ARIA (`aria-live`, `aria-label`), permitiendo que autores con discapacidad visual utilicen Duvarret Studio para crear sus propias obras.

---
*Fin de la Especificación de Diseño UI/UX: Duvarret Studio*
