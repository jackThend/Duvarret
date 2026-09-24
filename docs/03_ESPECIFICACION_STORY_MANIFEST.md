# Especificación Técnica del Manifiesto Declarativo
## Archivo Maestro: `story_manifest.json`

**Versión del Esquema:** 1.0.0  
**Fecha:** Septiembre 2026  
**Propósito:** Definir el contrato de datos estandarizado y determinista que el Agente Co-Director genera y que el Reproductor Universal (Duvarret Runtime) ejecuta sin necesidad de código arbitrario.

---

## 1. Filosofía del Manifiesto

El archivo `story_manifest.json` es el corazón declarativo de Duvarret. Resuelve el problema fundamental del "código espagueti" y las alucinaciones de IA:
1. **El Agente nunca programa:** Solo rellena este archivo estructurado bajo reglas de validación estrictas (JSON Schema).
2. **Determinismo total:** Dos ejecuciones del mismo manifiesto generan exactamente la misma experiencia en cualquier plataforma (.exe de Windows, macOS, Linux, Web/PWA o Audio-drama).
3. **Soporte Polimórfico:** Un único esquema aloja desde la prosa clásica ilustrada hasta puzles de terminal retro y paisajes sonoros binaurales 3D.

---

## 2. Estructura General del Manifiesto

Un `story_manifest.json` completo contiene los siguientes bloques de primer nivel:

```json
{
  "$schema": "https://duvarret.engine/schemas/v1/story-manifest.json",
  "metadata": { ... },
  "global_settings": { ... },
  "character_registry": { ... },
  "item_registry": { ... },
  "acoustic_environment": { ... },
  "nodes": [ ... ]
}
```

---

## 3. Especificación Detallada de Campos

### 3.1 `metadata` (Metadatos de la Obra)
Información editorial sobre el título, autores y licencias:

```json
"metadata": {
  "title": "La Sombra del Molino",
  "author": "Elena M. & Co-Director Agéntico",
  "version": "1.0.0",
  "language": "es-ES",
  "genre": "Misterio Ergódico / Ciberpunk Histórico",
  "created_at": "2026-09-24T02:00:00Z",
  "duvarret_runtime_target": ">=1.0.0"
}
```

---

### 3.2 `global_settings` (Configuración de Accesibilidad y Modo)
Define las reglas operativas globales del reproductor:

```json
"global_settings": {
  "default_mode": "multimedia", // "contemplative_book" | "multimedia" | "audio_drama_screenless"
  "allow_screenless_toggle": true, // Permite al usuario apagar la pantalla y jugar 100% en audio
  "audio_engine": "resonance_3d", // "resonance_3d" | "steam_audio_wasm" | "stereo_simple"
  "font_family_base": "Spectral, serif",
  "theme_palette": {
    "background": "#0d0f12",
    "foreground": "#e6e8eb",
    "accent": "#d97706"
  }
}
```

---

### 3.3 `character_registry` (Registro de Personajes y Sprites)
Catálogo de entidades que participan en diálogos de Novela Visual o tienen voces asociadas:

```json
"character_registry": {
  "sancho": {
    "name": "Sancho Panza",
    "color_accent": "#10b981",
    "voice_profile": {
      "tts_pitch": 0.9,
      "tts_speed": 1.05,
      "locution_sample": "assets/audio/voices/sancho_sample.ogg"
    },
    "sprites": {
      "neutral": "assets/images/characters/sancho_neutral.webp",
      "alarmed": "assets/images/characters/sancho_alarmed.webp",
      "skeptical": "assets/images/characters/sancho_skeptical.webp"
    }
  },
  "narrador": {
    "name": "Voz Omnisciente",
    "color_accent": "#94a3b8"
  }
}
```

---

### 3.4 `item_registry` (Inventario y Pistas del Grafo)
Objetos que el jugador puede inspeccionar, poseer o usar para resolver chequeos de rol o puzles:

```json
"item_registry": {
  "sobre_lacrado": {
    "name": "Sobre con Lacre Negro",
    "description": "Un documento confiscado en el laboratorio subterráneo. El sello aún está intacto.",
    "icon": "assets/images/items/sealed_envelope.webp",
    "is_inspectable": true,
    "inspect_content": "Al trasluz se distingue una cifra: '7391'."
  }
}
```

---

## 4. Estructura de los Nodos Narrativos (`nodes[]`)

Cada nodo representa un **beat dramático** (300 a 800 palabras de prosa o una interacción específica). 

A continuación se muestra un ejemplo exhaustivo de un nodo que combina **Literatura Ergódica**, **Audio Espacial 3D**, **Novela Visual** y un **Minijuego**:

```json
{
  "node_id": "nodo_023_camara_subterranea",
  "chapter_id": "capitulo_2",
  "title": "La Infiltración en el Búnker",
  
  "text_payload": "El eco de las gotas de condensación rebotaba contra las láminas de acero. El pasadizo se volvió tan angosto que apenas podía respirar sin raspar los codos contra los muros. Al final del túnel, una consola fosforescente parpadeaba en la penumbra.",

  "typographic_engine": {
    "layout_mode": "narrow_corridor",
    "column_width_rem": 24.0, // Ancho comprimido para transmitir claustrofobia
    "flicker_effect": true, // Parpadeo leve en sincronía con la consola
    "heartbeat_sync": {
      "enabled": true,
      "bpm": 95,
      "text_scale_amplitude": 0.02
    },
    "flashlight_reveal": {
      "enabled": true,
      "radius_px": 180,
      "darkness_opacity": 0.92
    }
  },

  "acoustic_events": [
    {
      "event_id": "gotera_posicional",
      "asset": "assets/audio/sfx/drip_echo.ogg",
      "trigger": "on_node_enter",
      "loop": true,
      "coordinates": { "x": 3.5, "y": 1.2, "z": -4.0 }, // A la derecha, arriba y atrás
      "room_preset": "narrow_concrete_corridor",
      "acoustic_material": "concrete",
      "gain": 0.75
    },
    {
      "event_id": "pasos_enemigo",
      "asset": "assets/audio/sfx/heavy_footsteps.ogg",
      "trigger": "on_text_reveal_percentage",
      "trigger_value": 60, // Se dispara cuando el lector ha leído el 60% del texto
      "loop": false,
      "coordinates": { "x": 0.0, "y": 0.0, "z": -12.0 }, // 12 metros a la espalda
      "room_preset": "narrow_concrete_corridor"
    }
  ],

  "visual_novel_overlay": {
    "enabled": true,
    "trigger": "on_text_complete",
    "active_speaker": "sancho",
    "current_mood": "alarmed",
    "dialogue_text": "¡Por favor, señor! ¿No oye esos pasos a nuestras espaldas? ¡Esa consola es una trampa!",
    "avatar_position": "left"
  },

  "gameplay_overlay": {
    "type": "cipher_lock",
    "is_mandatory_to_advance": true,
    "title": "Consola del Sistema Central",
    "parameters": {
      "screen_type": "crt_green_phosphor",
      "prompt_text": "INTRODUZCA CÓDIGO DE ANULACIÓN DE ALARMA:",
      "target_code": "7391",
      "max_attempts": 3,
      "clue_reference_item": "sobre_lacrado"
    },
    "on_success": {
      "grant_flags": ["alarma_desactivada", "puerta_bunker_abierta"],
      "play_sfx": "assets/audio/sfx/door_hydraulic_open.ogg",
      "transition_to_node": "nodo_024_sala_servidores"
    },
    "on_failure": {
      "grant_flags": ["alarma_disparada"],
      "play_sfx": "assets/audio/sfx/alarm_siren_3d.ogg",
      "transition_to_node": "nodo_024_emboscada_seguridad"
    }
  },

  "rpg_checks": [
    {
      "type": "passive",
      "stat": "percepcion",
      "difficulty": 12,
      "on_pass_reveal_extra_text": "Percibes una leve brisa tibia proveniente de la rejilla a tu izquierda; hay otra salida."
    }
  ],

  "screenless_mode": {
    "voice_over_asset": "assets/audio/narration/nodo_023_locucion.ogg",
    "foley_bed": "assets/audio/ambience/underground_ambience_binaural.ogg",
    "voice_prompts": [
      {
        "spoken_prompt": "¿Deseas intentar hackear la consola o buscar otra salida en la oscuridad?",
        "voice_options": [
          { "phrase": "hackear consola", "target_node": "nodo_023_puzzle_audio" },
          { "phrase": "buscar salida", "target_node": "nodo_023_rejilla" }
        ],
        "keypad_shortcuts": {
          "1": "nodo_023_puzzle_audio",
          "2": "nodo_023_rejilla"
        }
      }
    ]
  },

  "navigation": {
    "default_next_node": "nodo_024_sala_servidores",
    "choices": [
      {
        "choice_text": "Inspeccionar los cables expuestos bajo la consola",
        "target_node": "nodo_023_cables_minijuego",
        "condition": {
          "required_flag": "alarma_desactivada"
        }
      },
      {
        "choice_text": "Volver sobre tus pasos hacia la entrada",
        "target_node": "nodo_022_retroceso"
      }
    ]
  }
}
```

---

## 5. Catálogo de Directivas Polimórficas del Runtime

### 5.1 Catálogo Tipográfico (`typographic_engine`)

| Directiva | Parámetros Clave | Comportamiento en Runtime |
| :--- | :--- | :--- |
| `narrow_corridor` | `column_width_rem`, `transition_speed_ms` | Comprime el ancho de lectura para producir sensación de asfixia o túnel. |
| `melt_text` | `intensity`, `direction`, `duration_ms` | Aplica un shader WebGL que derrite las palabras hacia abajo simulando calor o pérdida de cordura. |
| `heartbeat_tremor` | `bpm`, `amplitude` | Hace vibrar sutilmente la tipografía siguiendo la frecuencia del pulso cardíaco. |
| `flashlight_mask` | `radius_px`, `darkness_opacity` | Cubre el texto de negro total salvo un cono circular que sigue el cursor del ratón o el dedo. |
| `physics_fall` | `gravity`, `bounce_factor` | Las palabras del párrafo se desacoplan y caen al suelo de la pantalla rebotando con física 2D. |
| `mirror_inverted` | `axis: "x" \| "y"` | Invierte el texto como en un espejo o de cabeza para escenas oníricas. |

---

### 5.2 Catálogo Acústico 3D (`acoustic_events[]`)

| Parámetro | Tipo | Descripción |
| :--- | :--- | :--- |
| `coordinates` | `{ x, y, z }` | Coordenadas cartesianas en metros relativas a la cabeza del oyente. $(0,0,0)$ es el centro del cráneo. |
| `room_preset` | `string` | Presets acústicos: `small_study`, `narrow_concrete_corridor`, `wooden_cabin`, `cathedral_echo`, `outdoor_field`. |
| `acoustic_material` | `string` | Define la absorción de altas frecuencias: `wood`, `concrete`, `metal`, `curtains`, `glass`. |
| `trigger` | `string` | Momento de activación: `on_node_enter`, `on_text_reveal_percentage`, `on_choice_hover`, `on_puzzle_solve`. |

---

### 5.3 Catálogo de Componentes de Minijuegos (`gameplay_overlay`)

1. **`crt_terminal`:** Emulador de terminal con soporte de comandos ficticios (`ls`, `cat`, `connect`, `override`), visualización fósforo verde/ámbar y escaneo de líneas CRT.
2. **`fictional_desktop`:** Entorno simulado estilo SO retro (años 90 / ciberpunk) con carpetas de archivos, visor de imágenes y navegador web falso.
3. **`cipher_lock`:** Panel de combinación numérica o de texto para descifrar contraseñas con feedback sonoro de clics mecánicos.
4. **`circuit_wiring`:** Minijuego de conectar terminales de cableado eléctrico para restablecer energía o puentear compuertas.

---

## 6. Validación y Tolerancia a Fallos

El runtime de Duvarret incorpora un **Middleware de Validación Estricta**:
* **Fallbacks Automáticos:** Si el agente omite una coordenada acústica $z$, el sistema asume $z = 0.0$ (al nivel del oyente) en lugar de arrojar una excepción.
* **Integridad de Nodos:** Si un `transition_to_node` apunta a un nodo inexistente, el validador en tiempo de compilación lo detecta y lo señala en el Editor Studio antes de permitir la exportación.
* **Aislamiento de Errores:** Si un asset de audio o imagen no se encuentra en el disco, el runtime muestra un placeholder estilizado y reproduce un tono de prueba sin detener la lectura.

---
*Fin de la Especificación del Manifiesto Declarativo*
