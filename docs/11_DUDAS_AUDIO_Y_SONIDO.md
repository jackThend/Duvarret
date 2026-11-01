# Audio por escena, sonidos a tiempo y banco de efectos — plan de trabajo

**Qué es este documento.** El resultado de una sesión de dudas con el autor (31-10-2026) sobre cómo
una escena concreta puede tener voz espacializada, efectos sincronizados con la lectura y sonidos de
un banco libre. No es una lista de deseos: cada tarea trae dónde se toca el código, qué cuenta como
terminado y qué queda por decidir.

**Cómo usarlo.** Leer las secciones 1 y 2 antes de abrir cualquier archivo: la mitad de lo que
parecía faltar ya está construido, y hay dos correcciones a suposiciones iniciales que ahorran
trabajo inútil. La sección 3 es el orden de ejecución. La sección 4 son las preguntas que el autor
tiene que responder antes de implementar lo que dependa de ellas; no inventar la respuesta.

**Precedencia.** `MASTER_IMPLEMENTATION_PLAN.md` manda sobre el calendario general; este documento
solo ordena el trabajo de audio. Las convenciones del proyecto (`CLAUDE.md`) siguen vigentes:
interfaz y commits en español, y **el agente nunca escribe JSON a mano**: toda edición del
manifiesto pasa por las herramientas y el validador.

---

## 1. Lo que ya está construido

Esta sección existe para que nadie reimplemente lo que funciona.

### 1.1 Audio espacial completo
- `acoustic_events[]` es **por escena**, no global (`src/core/manifest/schema.ts`): una sola escena
  puede tener voz y efectos situados sin tocar el modo audio-drama ni el resto de la obra.
- Ejes en metros respecto al centro de la cabeza (`src/runtime/audio/coordinates.ts`):
  X izquierda(−)/derecha(+), Y abajo(−)/arriba(+), Z detrás(−)/delante(+). «A la derecha y muy
  cerca» ≈ `{ x: 0.35, y: 0, z: 0.1 }`. Bajo 0,3 m, `describePosition` dice «junto a tu oído».
- Tres backends con degradación elegante (`src/runtime/audio/backends.ts`): `resonance_3d` (Google
  Resonance, ambisónicos + materiales de sala) → `hrtf_native` (PannerNode HRTF + convolución
  sintetizada) → `stereo_simple`. Se elige en `global_settings.audio_engine`.
- Precarga por escena para disparar con baja latencia; al salir de la escena se cortan los bucles.
- Si un archivo falta, suena un tono de prueba en la misma posición y se avisa: la lectura no se
  rompe nunca.

### 1.2 El agente ya coloca sonidos hablando en español
`src/core/agent/tools/directorTools.ts` da al Agente Director una herramienta por capa:

| Herramienta | Qué pone en la escena |
|---|---|
| `setTypographicEffect` | pasillo angosto, texto derretido, temblor del pulso, linterna, caída, espejo |
| `placeSpatialAudio` | **un sonido en una posición 3D de la escena** |
| `mountSimulatedModule` | terminal retro, escritorio, cerradura de combinación, cableado |
| `setVisualNovelSegment` | diálogo con retratos y estados de ánimo |
| `requestAssetSynthesis` | pide crear un recurso (`portrait`, `background`, `sfx`, `voice`) |
| `queryLoreGraph` / `updateLoreEntity` / `validateContinuity` | memoria y coherencia de la obra |

`placeSpatialAudio` acepta `position_description` **en lenguaje natural**, que
`src/core/agent/spatialLanguage.ts` interpreta (RF-11). Reconoce hoy:
- lados y ejes: «a la derecha», «por detrás», «arriba», «en el techo», «bajo el suelo»;
- intimidad: «al oído derecho» → `{ x: 0.25, y: 0, z: 0 }`;
- distancias: «a tres metros», «3 m», «muy cerca» (1 m), «cerca» (2 m), «lejos» (10 m), «a lo lejos»
  (15 m); sin dirección, lo sitúa delante del oyente;
- movimiento: «se acerca» / «se aleja», devuelto como `motion` — **reconocido pero aún sin efecto en
  el runtime** (ver tarea 7).

El agente responde explicando su lectura: «"susurro" a 0,3 m, junto a tu oído, con el eco de estudio
íntimo». Si el archivo no existe, lo inscribe en el registro como `missing`.

**Conclusión: «esta escena tiene una voz que suena a lo lejos» ya funciona para la colocación.** Lo
que falta es el archivo (tarea 1).

### 1.3 Nada es excluyente
En `StoryNodeSchema` estos campos son independientes y opcionales a la vez: `text_payload`,
`illustration`, `ambient_lighting`, `typographic_engine`, `acoustic_events[]`,
`visual_novel_overlay`, `gameplay_overlay`, `rpg_checks[]`, `screenless_mode`, `navigation`.

Una misma escena puede tener grillos en bucle a lo lejos **+** texto que se derrite **+** luz de vela
**+** un puzle obligatorio **+** una decisión al final. Cada herramienta del agente parchea solo su
propio campo, así que las instrucciones del autor se acumulan en vez de pisarse. Esto es el
«espectro polimórfico» del doc 02: arquitectura, no aspiración. **No romper esta propiedad.**

### 1.4 Motor de voz incluido
- Kokoro v1.0 ONNX + eSpeak-ng + Python embebido se empaquetan en `dist-voice/` (~474 MiB) como
  recurso Tauri `voice/`. Detalle en `docs/10_MOTOR_VOZ_INCLUIDO.md`. Voz española `ef_dora`, con
  interpretación `natural` o `dulce`. Funciona **sin internet y sin cuenta**.
- Studio genera los WAV en la máquina del autor y los guarda en `assets/` de la obra. **El lector
  exportado no lleva el motor**: solo reproduce archivos, así que solo viajan los WAV. Esto no es una
  limitación para la voz por escena, es justo lo que la hace posible.
- Proveedores remotos ya soportados para narración: `gemini`, `elevenlabs`, `openai`, `compatible`.
  Las credenciales nunca entran en la obra.
- Síntesis con caché por hash y aplicación al manifiesto: `src/core/narration/plan.ts`.

### 1.5 Disparo sincronizado con la lectura (parcial)
`ACOUSTIC_TRIGGERS` (`src/core/manifest/catalog.ts`): `on_node_enter`,
`on_text_reveal_percentage` (con `trigger_value` 0–100), `on_text_complete`, `on_choice_hover`,
`on_puzzle_solve`. El umbral lo dispara el tipeo (`typewriter_speed_cps`) en `setRevealProgress`
(`src/runtime/stores/story.ts`), una sola vez por visita. Es un temporizador **relativo al progreso
de lectura**, no al reloj: aguanta que el lector vaya rápido o lento.

### 1.6 Registro de procedencia (RF-14)
`src/core/assets/registry.ts` persiste `assets/audio/registry.json` con `path`, `kind`, `origin`
(`author` | `synthetic`), `status` (`ready` | `pending` | `missing`), `title`, `author`, `license`,
`provider`, `prompt`, `style_preset`, `created_at`, `bytes`.

### 1.7 Interfaz sin fricción
- **Nadie abre la carpeta `assets/`.** `AssetsDialog.vue` acepta arrastrar y soltar o el botón de
  elegir. La ruta interna la calcula `assetPathFor`: «Gotera Fría.WAV» → `assets/audio/gotera_fria.wav`,
  sin tildes, sin espacios, sin colisiones.
- **Asignación guiada** tras subir: sonido de escena, retrato, icono, ambiente, ilustración o
  narración. `assignAsset` escribe el manifiesto; el autor no ve JSON.
- **Cada recurso se nombra por su uso, en lenguaje literario** (`src/core/assets/usages.ts`):
  «Sonido "gotera" en El Pasillo», «Retrato de Sancho Panza (alarmado)».
- **Comprobación real de existencia**: `probe()` separa disponibles de faltantes y descarta la trampa
  del servidor que devuelve HTML en vez de un 404.
- **Colocación por gesto**: «Sonido colocado delante del oyente: ajústalo arrastrándolo en el radar».
- **Cada fallo se nombra** al soltar varios archivos a la vez (commit `b8e3fa1`).
- **Mensajes en lengua de artista**, ya escritos: «"x" no es un sonido ni una imagen que Duvarret
  sepa usar», «Ese lugar espera una imagen, no un sonido», «pesa demasiado (máximo 50 MB)».
- **La exportación se bloquea** con los errores de `checkIntegrity` (`src/core/manifest/integrity.ts`):
  escenas duplicadas, caminos a escenas inexistentes, voz de la obra desactualizada.
- **Patrón a imitar** para cualquier generación nueva: la ilustración genera → **previsualiza** →
  solo entra en la obra si el autor acepta (`generatedImage` + `acceptImage` en `AssetsDialog.vue`).

---

## 2. Dos correcciones a suposiciones iniciales

Anotadas para que nadie trabaje de más:

1. **El registro de procedencia no hay que crearlo.** En la primera redacción se propuso diseñar un
   `assets/CREDITOS.json`. Ya existe (§1.6) con los campos `license` y `author`. Lo que falta es que
   **algo los rellene**, porque hoy nadie escribe esos dos campos.
2. **El agente no hay que enseñarle a colocar audio.** Ya lo hace, y además en lenguaje natural
   (§1.2). El hueco es solo el archivo que debe colocar.

---

## 3. Trabajo por hacer, en orden

El orden está pensado para que cada tarea deje algo usable y no bloquee a la siguiente. Las tareas 1
y 2 son las de mayor efecto por línea escrita.

### Tarea 1 — Voz y efectos en el sintetizador del Studio
> **Estado (31-10-2026): voz y efectos del banco libre hechos; falta la generación remota (tarea 9).** El sintetizador de
> `toolContext()` devuelve ahora **borradores** (`status: 'draft'`): `project.draftSpokenLine` crea la
> réplica con Kokoro (escritorio) o con el servicio de voz elegido, la valida y la deja en memoria con
> su URL de vista previa (`stageGeneratedAsset`). La tarjeta de propuesta la muestra con «▶ Escuchar»;
> solo `applyPitch` la guarda (`acceptGeneratedAsset`) con su procedencia, y descartar la olvida sin
> rastro. Las imágenes del director siguen el mismo camino (antes se guardaban al generarse). El
> director local entiende «una voz que susurre «…» a mi oído derecho»: crea la voz y, con la ruta ya
> conocida, la coloca. Lo que no se ha podido comprobar aquí: la rama Kokoro en el ejecutable real
> (usa `narration_generate` + `project_read_bytes`, sin cambios en Rust). `sfx` sigue cayendo en
> `OfflineSynthesizer`. *Actualización:* `sfx` busca ahora en Freesound (tarea 3) y devuelve el primer
> sonido CC0 como borrador; sin clave o sin resultados, sigue reservándolo como pendiente.

**Por qué primero.** Es el único eslabón que impide que «ponme aquí una voz que susurre esto a mi
derecha» sea una sola conversación. Toda la infraestructura existe; falta conectarla.

**El hueco.** `requestAssetSynthesis` admite `type: 'sfx'` y `type: 'voice'`, pero el sintetizador
que el Studio le inyecta (`src/studio/stores/studio.ts`, función `toolContext()`) solo implementa
`portrait` y `background` con `generateImage`. Para sonido y voz cae en `OfflineSynthesizer`
(`src/core/assets/registry.ts`), que **no genera nada**: reserva una ruta con estado `pending` y
responde «queda pendiente de crearse o de que aportes el tuyo». Mientras tanto la síntesis de voz sí
funciona, pero vive en el diálogo «Narrar» con `planNarration` y el agente no puede llamarla.

**Qué hacer.** Dar tres ramas al mismo `synthesize()` que ya hace imágenes:
- `voice` → motor Kokoro local, o el proveedor remoto ya configurado si el autor lo eligió;
- `sfx` → búsqueda en el banco libre (tarea 3) y, si no hay nada, generación remota (tarea 6);
- el resultado entra por `project.addGeneratedAsset`, que ya rellena `provider` y `prompt`.

**Interfaz.** Mismo patrón que la ilustración: genera → **previsualiza con un botón de escuchar** →
el radar para colocarlo → solo entra en la obra si el autor acepta. Nada se guarda a sus espaldas.

**Terminado cuando.** En el chat, «ponme una voz que susurre "no mires atrás" a mi oído derecho»
produce el WAV, lo deja escuchar, lo coloca como `acoustic_event` con sus coordenadas y queda
registrado con su procedencia; y el autor puede rechazarlo sin que nada se haya guardado.

### Tarea 2 — Validar el contenido de cada archivo, no su extensión
> **Estado (31-10-2026): hecha.** `checkAssetContent` (`src/core/assets/content.ts`) se llama desde
> `addAsset` y valida los bytes de WAV, MP3, OGG/Opus, FLAC, M4A, PNG, JPEG, WEBP, GIF, SVG y AVIF.
> Nombra lo que parece el archivo («parece un vídeo, no un sonido») y acepta con su extensión real un
> sonido válido mal nombrado (un WAV llamado `.mp3`).

**Por qué.** Es el agujero de aviso más grave. `addAsset` (`src/studio/stores/project.ts:146`)
comprueba tamaño y extensión, nada más. Un WAV truncado, un archivo corrupto o **un vídeo renombrado
a `.mp3` entra sin una sola queja** y falla después en silencio: al reproducir suena el tono de
prueba, sin explicar por qué.

**La solución ya está escrita.** `validateGeneratedMedia()` (`src/core/ai/media.ts`) valida de verdad
las cabeceras: WAV (RIFF/WAVE, trozos `fmt ` y `data`, canales, frecuencia de muestreo), MP3 (salto
de ID3 y sincronía de trama), PNG, JPEG, WEBP. Hoy solo se usa para lo que generan los proveedores.

**Qué hacer.** Llamarla también desde `addAsset`, y ampliarla a OGG/Opus, FLAC y M4A, que están entre
las extensiones aceptadas (`AUDIO_EXTENSIONS`) pero no entre los formatos verificados. El mensaje
debe decir qué pasó, en lengua de artista: «"disparo.wav" está incompleto o no es realmente un
sonido».

**Terminado cuando.** Un archivo corrupto y un vídeo renombrado se rechazan al soltarlos, con su
motivo nombrado, y ningún archivo inválido llega al manifiesto. Con varios archivos a la vez, cada
rechazo se nombra por separado (comportamiento ya existente, no romperlo).

### Tarea 3 — Buscador del banco libre dentro del Studio
> **Estado (31-10-2026): hecha, con previews** (decisión §4.2 tomada por el autor). Freesound es una
> conexión más (clave cifrada, cabecera `Authorization: Token`); los previews del CDN
> `cdn.freesound.org/previews/` se bajan sin enviar la clave, también en Rust (`freesound_preview`).
> Cliente en `src/core/assets/freesound.ts` (filtro CC0 pedido y comprobado), buscador en
> `AssetsDialog.vue` y rama `sfx` del sintetizador del director. El director local reconoce también
> grillos, ladridos y disparos, y busca en inglés. **Sin verificar:** una búsqueda real contra
> Freesound (requiere la clave del autor), la descarga del CDN desde el navegador web (CORS) y el
> código Rust, que solo compila la CI.

**Fuente principal: Freesound, filtrado a CC0.** API v2:
`GET https://freesound.org/apiv2/search/text/?query=grillos&filter=license:"Creative Commons 0"`,
con el token en la cabecera `Authorization: Token <clave>`. CC0 es la única licencia que no obliga a
arrastrar créditos por obra y permite uso comercial sin letra pequeña.

**Matiz verificado:** descargar el **archivo original** exige OAuth2; los *previews* en alta calidad
se bajan con solo el token. Ver decisión pendiente §4.2.

**Descartado y por qué:**
- **Pixabay**: su API documenta solo imágenes y vídeo, no audio, aunque el sitio tenga sonidos. Sirve
  como fuente manual, no automatizable.
- **BBC Sound Effects**: licencia solo personal y educativa. **No usar nunca.**
- Para descarga manual del autor: OpenGameArt (CC0), Kenney, Mixkit (licencia propia).

**Qué hacer.** Un buscador en `AssetsDialog.vue` y una herramienta equivalente para el agente, de
modo que funcione tanto si el autor busca como si se lo pide al co-director.

**Interfaz.** Resultados **escuchables** en la lista, **licencia visible** en cada uno, y al elegir
uno se descarga, se valida con la tarea 2 y se asigna en un solo paso.

**Terminado cuando.** Elegir un sonido del buscador deja en la obra un archivo validado y un registro
con `license` y `author` rellenos, sin que el autor haya visto una ruta ni una carpeta.

### Tarea 4 — Avisar al exportar de un archivo que no existe
> **Estado (31-10-2026): hecha, como aviso** (decisión §4.3). Al abrir el panel de exportación,
> `presentAssets` (`src/studio/services/assetProbe.ts`, la misma comprobación que el diálogo de
> recursos) y `missingAssetIssues` (`src/core/assets/usages.ts`) nombran cada sonido o imagen ausente
> con su escena; el nombre lleva a la escena y «Aportar archivo» lo sustituye ahí mismo, validado. No
> bloquea: si se exporta con algo ausente, basta confirmar «Exportar igualmente».

**Por qué.** `checkIntegrity` solo ve el manifiesto, no el disco. El único lugar que comprueba la
existencia real es `probe()`, dentro del diálogo de recursos, **y hay que abrirlo a mano**. Hoy se
puede publicar una obra en la que el disparo no suena y nada lo advierte.

**Qué hacer.** Un diagnóstico alimentado por la misma comprobación que `probe()`, que aparezca en el
panel de exportación nombrando la escena y el sonido, y sea navegable como los demás avisos.

**Terminado cuando.** Intentar exportar una obra con un sonido referenciado pero ausente muestra el
aviso con la escena nombrada y permite salvar la situación desde ahí.

**A decidir con el autor:** ¿bloquea la exportación (`error`) o solo advierte? Ver §4.3.

### Tarea 5 — Que el aviso del motor de audio llegue al Studio
`onWarning` del `SpatialAudioEngine` solo está conectado en `RuntimePlayer.vue`, que lo emite como
evento. En la vista previa del Studio ese aviso debería aparecer como una nota sobre la escena:
«Falta el sonido "disparo"; oyes un tono de prueba».

**Terminado cuando.** Previsualizar una escena con un sonido ausente muestra la nota sin interrumpir
la lectura.

### Tarea 6 — Retardo propio en los eventos acústicos (`delay_ms`)
Un campo nuevo en `acoustic_event` aplicable a cualquier disparador: «dos segundos después de
entrar». Es un campo en el esquema y un temporizador en `SpatialAudioEngine.bind()`, **cancelado en
`node_exit`** para que no suene en la escena siguiente.

Desbloquea bastante del «justo cuando lo leo» sin esperar a la tarea 7, y habilita secuencias
sencillas (pasos, pasos, disparo, silencio) con varios eventos y retardos distintos.

**Terminado cuando.** Un evento con `delay_ms` suena a su hora, y no suena nunca si el lector cambia
de escena antes. Con prueba unitaria del caso de cancelación.

### Tarea 7 — Marca en el texto: `on_text_marker`
**El problema que resuelve.** `on_text_reveal_percentage` es tosco: para que el disparo suene
exactamente en la palabra «disparó» hay que calcular el porcentaje a mano, y se rompe en cuanto el
autor edita el párrafo.

**Qué hacer.** El autor escribe una marca dentro de `text_payload`, p. ej. `⟦disparo⟧`, donde quiere
el sonido. El compilador la extrae, la convierte en el porcentaje del carácter donde cae y la borra
del texto visible. Así la marca se mueve con el párrafo al reescribirlo, y el autor nunca toca JSON.

**Dónde se toca.** Trigger nuevo en `src/core/manifest/catalog.ts` con su etiqueta literaria;
extracción en `src/core/compiler/`; y `src/studio/components/WritingCanvas.vue` debe pintar la marca
**como una ficha**, nunca como texto crudo; al pulsarla se elige el sonido y su retardo.

**Bloqueada por la decisión §4.1** (qué hace la marca en el modo libro contemplativo). Implementar
primero el camino de `multimedia` solo si esa decisión no cambia el diseño del campo.

### Tarea 8 — Réplicas habladas espaciales (`speech` en `acoustic_event`)
Un `acoustic_event` puede llevar `speech: { text, voice, delivery }`. El narrador lo sintetiza con el
mismo motor y caché por hash que los clips (`assets/audio/voz-natural/<voz>/<hash>.wav`), pero el
runtime lo reproduce por `playEvent`, con coordenadas y sala.

**Reevaluar antes de empezar:** tras la tarea 1 puede que ya no haga falta, porque el texto quedaría
en el registro de procedencia (`prompt`) y el archivo colocado como evento normal. Hacerla solo si se
necesita volver a sintetizar la réplica al cambiar la voz de la obra.

### Tarea 9 — Generación remota de efectos
ElevenLabs `POST https://api.elevenlabs.io/v1/sound-generation`, cabecera `xi-api-key`. Es el
proveedor que ya se soporta para voz, así que la misma clave sirve. Es de pago por crédito, así que
va **al final de la cadena**: solo cuando el banco libre no tiene lo que la escena pide.

### Tarea 10 — Movimiento de fuentes (`motion`)
`parseSpatialDescription` ya devuelve `'approaching' | 'receding' | 'static'`, y el runtime lo
ignora. «Unos pasos se acercan por detrás» debería interpolar la posición durante la escena. Es la
más prescindible de la lista; anotada para que no se pierda.

---

## 4. Decisiones pendientes del autor

**No inventar estas respuestas.** Preguntar antes de implementar lo que dependa de ellas.

### 4.1 La marca en el modo libro contemplativo (bloquea la tarea 7)
En `contemplative_book` no hay tipeo, así que el progreso de lectura no avanza solo y la marca
quedaría muda. Opciones: respaldarla con el scroll (`IntersectionObserver`), con un tiempo estimado
por palabras por minuto, o aceptar que ese modo no tiene sonidos sincronizados.

### 4.2 Previews o archivos originales de Freesound (afecta a la tarea 3)
**Decidido (31-10-2026): previews.** OAuth2 queda para más adelante si hace falta calidad sin pérdida.
Los previews en alta calidad se bajan con solo el token; el original exige implementar OAuth2. Para
efectos cortos el preview probablemente basta. ¿Vale la pena el OAuth?

### 4.3 Un archivo ausente bloquea o solo advierte (afecta a la tarea 4)
**Decidido (31-10-2026): solo advierte.**
¿Severidad `error`, que impide exportar, o aviso que deja publicar bajo responsabilidad del autor?

### 4.4 Evaluación auditiva del español de Kokoro
Pendiente de la primera redacción y sigue abierta: `docs/10` dice que la voz incluida «aún requiere
evaluación auditiva externa para sostener una promesa pública de calidad en español». Kokoro es muy
bueno para su tamaño, pero para una voz humana indistinguible hoy la vía es un proveedor remoto.

### 4.5 Derechos de distribución de los proveedores remotos
Antes de publicar una obra narrada con un proveedor remoto hay que revisar sus condiciones de
distribución comercial. Igual para los efectos generados (tarea 9).

---

## 5. Las dos reglas que gobiernan todo lo anterior

Cualquier pieza nueva de audio, imagen o voz se juzga contra estas dos frases:

> **Nada entra en la obra sin que se haya validado su contenido.**
>
> **Nada falta sin que alguien lo diga antes de exportar.**

Y las dos del proyecto que esto no puede romper: el autor nunca ve JSON ni abre la carpeta `assets/`;
y las capas de una escena se acumulan, nunca se excluyen (§1.3).

---

## 6. Fuentes consultadas
- https://freesound.org/docs/api/overview.html
- https://opensource.creativecommons.org/blog/entries/freesound-intro/
- https://pixabay.com/api/docs/ (confirma que no hay endpoint de audio)
- https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert.md
- https://elevenlabs.io/docs/overview/capabilities/sound-effects
