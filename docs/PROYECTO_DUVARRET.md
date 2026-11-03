# Duvarret: documento del proyecto

**Qué es, para qué sirve, cómo se utiliza y cómo está construido**

Edición de referencia: **Studio 0.2.0**. Revisión: **3 de noviembre de 2026**.

Este es el documento principal del proyecto. Describe el producto de esta edición y distingue sus capacidades de las ampliaciones pendientes. El PDF que lo acompaña es una copia de lectura del mismo contenido. Para cambiar la documentación se edita este Markdown y se vuelve a generar el PDF.

## 1. Qué es Duvarret

Duvarret es una aplicación de autoría para convertir textos en obras literarias interactivas. Una persona puede escribir un cuento, importar un manuscrito o continuar una historia y combinar su prosa con decisiones, ilustraciones, voces, música, ambientes, efectos tipográficos y pequeñas escenas jugables. El resultado se comparte como una experiencia web, un audio-drama interactivo o un lector de escritorio.

Su propósito es que la forma de leer también cuente la historia. Si un personaje entra en un pasillo estrecho, el texto puede estrecharse. Si escucha una voz detrás de él, el sonido puede situarse detrás del lector. Una habitación a oscuras puede explorarse con una linterna y un objeto encontrado puede quedar en el inventario, abrir otra ruta y modificar el desenlace. El texto sigue siendo el centro; los recursos se eligen por su función narrativa.

La aplicación reúne dos piezas. **Studio** es el taller donde el autor escribe, prepara y prueba la obra. El **reproductor** es lo que recibe el lector: presenta escenas, reproduce recursos, mantiene el estado del recorrido y permite avanzar por sus caminos. Quien recibe una publicación no necesita Studio ni las claves de IA del creador.

Duvarret está orientado al trabajo local. Los proyectos y archivos se guardan en el dispositivo. Se puede escribir, gestionar recursos, probar, generar voz con el Kokoro incluido en Windows y exportar sin contratar un servicio de IA. Las conexiones de nube son opcionales y se configuran por capacidad.

## 2. Para quién y para qué

### 2.1 Personas a las que se dirige

- **Escritores y guionistas:** cuentos ramificados, novelas con capas de sonido, escenas de diálogo y decisiones con consecuencias.
- **Diseñadores narrativos:** prototipos de ficción interactiva con inventario, condiciones, acertijos y varios finales, sin construir un juego completo desde cero.
- **Docentes y divulgadores:** recorridos explicativos donde una elección, una imagen o una pequeña simulación ayuden a comprender un contenido.
- **Creadores de experiencias sonoras:** relatos narrados y ambientados que puedan recorrerse sin depender de la pantalla.
- **Autores que experimentan con la lectura:** prosa cuya disposición, movimiento y visibilidad formen parte de la experiencia.

No hace falta programar para seguir el recorrido habitual del Studio. La autoría consiste en escribir, seleccionar escenas, aceptar o descartar propuestas, colocar recursos y comprobar el resultado. El código y el formato declarativo quedan disponibles para desarrollo e integración.

### 2.2 Ejemplo completo de uso narrativo

Imaginemos un cuento de tres minutos sobre un faro abandonado. La primera página presenta la llegada con lluvia y oleaje. Al desplazarse hasta una palabra concreta, el lector oye un golpe después de un breve retardo. En otra escena mueve una linterna por una ilustración y encuentra un alfiler. Al inspeccionarlo en el inventario descubre una pista para una cerradura de ganzúa.

Tras abrir la puerta aparece una conversación con retrato y voz de personaje. Un escritorio ficticio contiene un expediente que revela un código. La prosa comienza a deshacerse y el último acertijo conduce a la decisión final: apagar el faro o mantenerlo encendido. Ambos desenlaces pertenecen a la misma obra. Su adaptación sonora conserva las decisiones mediante controles accesibles, aunque simplifica las interacciones visuales.

Ese ejemplo combina funciones ya presentes: marcas de sonido, ambiente, imagen, búsqueda, inventario, ganzúa, diálogo, escritorio, combinación y tipografía. No obliga a usar todas en cada cuento. Una obra puede ser una lectura tranquila con una sola ilustración y narración.

## 3. Las piezas de una obra

Una **obra editable** reúne texto, escenas, caminos, personajes, objetos, configuración y archivos multimedia. En escritorio vive en una carpeta terminada en `.duvarret`; esa terminación identifica un proyecto, no un archivo comprimido único. Copiar solo el manifiesto no equivale a copiar la obra completa.

Una **escena** es una unidad de narración. Puede contener prosa, título, ilustración, sonidos, diálogo o un módulo interactivo. La navegación enlaza escenas de manera lineal o mediante elecciones. Las condiciones consultan el estado del lector: objetos, indicadores narrativos o resultados previos. Las acciones pueden cambiar ese estado.

Una **publicación** es una salida preparada para el lector a partir de una versión de la obra. Permite compartir la experiencia sin entregar el entorno de creación. Conviene conservar siempre la fuente editable para continuar trabajando y volver a exportar.

La **biblioteca personal de recursos** es independiente de los proyectos. Guarda archivos reutilizables. Al usar uno en una obra, Studio copia sus bytes al proyecto, de modo que la publicación conserve sus propios recursos.

## 4. Qué puede experimentar el lector

### 4.1 Lectura y caminos

El reproductor permite recorrer escenas, escoger alternativas y alcanzar finales distintos. Un objeto puede habilitar una elección; un intento fallido puede llevar a otra escena; un hecho recordado puede modificar lo que aparece después. El historial y el estado de lectura permiten retomar el recorrido según las funciones del reproductor y del dispositivo.

Los controles narrativos incluyen inventario, inspección de objetos y comprobaciones de atributos. No se trata de una simulación general de rol: las reglas y consecuencias son las que el autor declara para esa obra.

### 4.2 Texto expresivo

La edición actual incluye página estándar, columna estrecha, texto que se derrite, temblor del pulso, revelado con linterna, palabras que caen y reflejo de espejo. Estos efectos se aplican a escenas concretas. La linterna que revela letras y la búsqueda de objetos en una habitación ilustrada son funciones diferentes.

El movimiento puede aportar tensión o representar un estado del personaje, pero no sustituye la legibilidad. El runtime contempla preferencias de movimiento reducido y representaciones alternativas cuando una capacidad gráfica no está disponible. El autor debe revisar cada escena y su equivalente accesible.

### 4.3 Ilustración y novela visual

Las ilustraciones pueden ocupar la escena, una cabecera o un margen. Los diálogos pueden presentarse con personajes, retratos, posiciones y variaciones de expresión. Una réplica hablada puede utilizarse como recurso de sonido además de la narración general.

Importar un retrato o generarlo no obliga a incorporarlo inmediatamente a una escena. Los borradores generados se previsualizan y la aceptación determina qué entra en la obra.

### 4.4 Escenas jugables incluidas

| Módulo | Qué permite | Uso narrativo posible |
| --- | --- | --- |
| Terminal de fósforo | Interactuar con una terminal ficticia y sus comandos previstos. | Consultar una máquina abandonada o descubrir una clave. |
| Escritorio antiguo | Abrir archivos y examinar expedientes simulados. | Investigar una desaparición o contrastar pistas. |
| Cerradura de combinación | Introducir y comprobar un código. | Aplicar una pista encontrada antes. |
| Cableado de circuitos | Resolver conexiones definidas para la escena. | Restablecer energía o desactivar un mecanismo. |
| Cerradura de ganzúa | Ajustar pernos según una configuración y un límite de intentos. | Abrir una puerta y decidir qué hacer si se falla. |
| Exploración con linterna | Buscar un objetivo en una imagen y recoger un objeto. | Registrar un cuarto oscuro antes de continuar. |

Son módulos preparados por el programa, con parámetros y consecuencias declarativas. La terminal y el escritorio son representaciones de ficción; no ejecutan órdenes del sistema del lector. Incorporar una mecánica nueva requiere ampliar y probar el runtime: una petición al asistente no crea automáticamente cualquier videojuego imaginable.

### 4.5 Sonido y modos de lectura

Los sonidos pueden dispararse al entrar en una escena, alcanzar una marca, terminar la lectura o resolver un acertijo, entre otros eventos. Pueden tener retardo, volumen, repetición y posición respecto al oyente. El radar acústico de Studio ayuda a mover sus fuentes.

El audio espacial permite crear sensación de distancia y dirección. Los ambientes de sala y materiales afectan a la escucha. La narración general mantiene un tratamiento directo para que la reverberación de los efectos no la vuelva confusa. La percepción espacial depende también de los auriculares, el dispositivo y el oyente; existe una prueba de escucha en Studio.

Hay tres modos principales: **libro contemplativo**, **experiencia multisensorial** y **audio-drama sin pantalla**. En el libro contemplativo las marcas de lectura se siguen mediante el desplazamiento del texto. El evento se dispara una vez por visita a la escena y respeta su retardo. Al agotar el scroll también se consideran las marcas que han quedado visibles por debajo de la línea habitual de lectura.

El modo sin pantalla presenta narración y controles accesibles para avanzar, repetir o elegir. Los minijuegos visuales se adaptan mediante acciones disponibles en ese modo; no reproducen necesariamente toda su interacción espacial. El código de una cerradura, por ejemplo, puede introducirse mediante controles accesibles. Publicar en este modo exige revisar el guion, las ayudas y los caminos con la misma atención que la versión visual.

## 5. Cómo se trabaja en Studio

### 5.1 Crear, importar o continuar

El primer paso es abrir **Mis obras**. Se puede comenzar desde cero, continuar un manuscrito o adaptar una obra. Al importar, el programa extrae texto de TXT, Markdown, PDF, DOCX o EPUB y lo segmenta en escenas iniciales. Esa extracción es un punto de partida: conviene revisar capítulos, cortes de escena, orden de lectura y navegación.

Un PDF escaneado sin texto seleccionable requiere una extracción u OCR previo; no debe suponerse que la importación reconstruye automáticamente sus imágenes, su maquetación y todas sus relaciones. Tampoco interpreta por sí sola una novela completa como una adaptación terminada.

En Windows, las obras nuevas se crean por defecto en la carpeta personal de Studio, con un identificador único que evita sobrescribir títulos iguales. Al crear una obra desde cero se puede elegir otra carpeta. Una obra existente se incorpora abriendo su carpeta `.duvarret`.

### 5.2 Escribir con la vista previa

La estructura de escenas está a la izquierda, la escritura y las propuestas del asistente en el centro, y la previsualización a la derecha. El autor puede cambiar de escena, editar su título y prosa, revisar caminos y reproducir el resultado desde el punto que está preparando.

El editor dispone de temas de lectura y paneles que se pueden recoger. La vista previa utiliza el runtime de la obra; permite descubrir antes de exportar problemas de ritmo, posición de sonidos, objetos que faltan o elecciones sin salida.

### 5.3 Guardado automático

Studio intenta guardar tras aproximadamente 1,2 segundos de pausa. La cabecera distingue cambios pendientes, escritura en curso, guardado completado y errores. Cambiar de obra espera a guardar; el cierre de la aplicación nativa también protege el trabajo pendiente.

Si una escritura falla, el mensaje de guardado importa: tener un texto todavía abierto no equivale a tenerlo persistido en disco. Se puede volver a intentar el guardado manual. El autoguardado no sustituye una copia de seguridad ni crea por sí solo un historial ilimitado de versiones.

### 5.4 Propuestas del asistente

El chat permite pedir una transformación, como «quiero una escena de búsqueda con linterna» o «estrecha este pasaje». El asistente prepara propuestas que el autor puede revisar, previsualizar, aceptar o descartar. El catálogo de posibilidades también se puede explorar desde la interfaz.

Aceptar una propuesta cambia la obra mediante herramientas y validación. El flujo protege las ediciones concurrentes para que una propuesta preparada sobre un texto anterior no sobrescriba sin más una revisión nueva. Se conserva la capacidad de deshacer y rehacer las operaciones admitidas por el editor.

## 6. Mis obras y el perfil local

**Mis obras** es el catálogo de proyectos del dispositivo. Permite buscarlos por título o autoría y continuar una obra existente. La versión 0.2.0 incorpora las referencias de la antigua lista de recientes y elimina su límite de 20 entradas, sin mover las carpetas originales.

El perfil es opcional. Un nombre o seudónimo se propone como autoría de las nuevas obras; cambiarlo no reescribe las anteriores. No es una verificación de identidad ni una cuenta de sincronización. Las obras no dependen de haber rellenado ese nombre.

Enviar una obra cerrada a la **papelera** cambia su estado en el catálogo y conserva sus archivos. Se puede restaurar. Borrar definitivamente requiere una segunda confirmación. En la aplicación nativa, ese borrado se limita a proyectos situados directamente dentro de la carpeta personal de Studio; las carpetas externas están protegidas. **Quitar referencia** elimina la entrada del catálogo y conserva los archivos externos.

La obra abierta está protegida. Para retirarla se abre otra primero. En el navegador, las obras residen en almacenamiento del sitio y su borrado definitivo afecta a ese espacio local.

El catálogo guarda ubicaciones, no una segunda copia de cada proyecto. Mover una carpeta desde el explorador puede dejar una referencia antigua: se debe abrir la obra desde su nueva ubicación. Borrar los datos del navegador o de su perfil puede eliminar el catálogo y, en la edición web, también los proyectos almacenados allí.

## 7. Mis recursos: un archivo reutilizable

**Mis recursos** reúne imágenes, voces, ambientes, música y efectos aportados o aceptados por el autor. Puede consultarse desde la cabecera de Studio. Permite añadir archivos, buscar, filtrar por imagen o audio, preescuchar, ver una imagen, cambiar su nombre y editar etiquetas.

La búsqueda considera nombre, etiquetas, autoría, licencia, proveedor y descripción de generación. «Lluvia noche» puede recuperar un ambiente etiquetado para una escena exterior, mientras «Dora» puede localizar grabaciones identificadas con esa voz.

El perfil permite activar o desactivar la incorporación automática de recursos importados o generados y aceptados, incluidas las grabaciones de Kokoro. Desactivarla no impide añadir archivos manualmente. Los recursos de obras anteriores se pueden copiar desde el panel de sonidos e imágenes de esa obra.

El archivo valida el contenido de los medios y evita duplicados idénticos mediante su huella SHA-256. Dos nombres distintos para los mismos bytes no crean necesariamente dos copias. La edición actual admite un máximo de 50 MB por archivo. Entre sus formatos están WAV, MP3, OGG/Opus, FLAC y M4A para audio; PNG, JPEG, WebP, GIF, SVG y AVIF para imagen.

### 7.1 Reutilización y procedencia

**Usar en esta obra** crea una copia dentro del proyecto. Después se coloca desde sus recursos, como ilustración, voz o sonido según corresponda. Se conservan los datos de procedencia disponibles. Renombrar o borrar la copia de la biblioteca no modifica automáticamente todas las obras que la utilizaron.

Esta independencia es deliberada: un cuento publicado debe seguir funcionando aunque el autor reorganice su archivo personal. La biblioteca no es un conjunto de enlaces externos que el lector tenga que resolver al abrir la publicación.

### 7.2 Borrado seguro

La papelera permite recuperar un recurso antes del borrado definitivo. La confirmación elimina la copia personal y deja intactas las copias de los proyectos. Dentro de una obra se bloquea la eliminación de archivos que todavía usan sus escenas; primero hay que sustituirlos o retirar sus usos.

Si el copiado automático a la biblioteca falla, el recurso que ya se guardó en la obra se conserva y Studio avisa para poder incorporarlo de nuevo. Los catálogos y las carpetas de recursos también deben incluirse en los respaldos del autor.

## 8. Voz, música, efectos e imágenes

### 8.1 Narración con Kokoro

La distribución Windows de referencia incluye Kokoro con su intérprete privado, runtime, modelos y licencias. La síntesis se procesa localmente. El autor no necesita preparar Python, instalar dependencias desde una terminal ni configurar una clave para esa voz incluida.

**Narración y voz** permite actualizar las grabaciones. La identidad de voz y un catálogo de frases quedan asociados al proyecto. Se generan también los textos auxiliares para una experiencia coherente: títulos, opciones, ayudas y avisos. Una actualización reutiliza frases que siguen vigentes y genera las pendientes; cambiar determinados ajustes puede requerir rehacer el conjunto.

La edición incluye interpretación natural y una variante dulce y pausada. La voz puede utilizarse como narración o como recurso de diálogo. Estos ajustes no equivalen a un actor humano capaz de cualquier emoción o estilo solicitado.

Se pueden grabar voces con micrófono o importar grabaciones propias. El permiso de micrófono depende del dispositivo y del entorno. Las publicaciones incluyen los audios terminados; el lector no necesita el motor de síntesis del autor.

### 8.2 Recursos gratuitos y conexiones opcionales

La escritura manual, el asistente básico por reglas, la biblioteca, el editor y la voz local permiten un recorrido sin servicios de pago. También se pueden aportar ilustraciones y sonidos originales o recursos con una licencia adecuada.

Studio integra búsqueda de sonidos de Freesound filtrada por CC0 y conserva la procedencia del recurso descargado. Esa conexión requiere configurarse, aunque el material seleccionado sea reutilizable bajo su licencia. La obtención de un recurso y las condiciones de un servicio son cuestiones distintas.

Las imágenes y otros medios generados por servicios externos dependen de las conexiones elegidas. La edición actual no trae un generador local universal de imágenes, música y efectos. Crear voz con Kokoro no genera automáticamente lluvia, disparos ni composiciones musicales. Para esos contenidos se usan archivos propios, bancos o las integraciones disponibles.

Las cuotas y precios de los proveedores pueden variar. Una conexión configurada no demuestra que todos sus modelos estén disponibles ni que cualquier generación vaya a ser gratuita. El autor conserva la decisión de enviar contenido a un servicio externo.

## 9. Qué hace la inteligencia artificial

El asistente básico sin conexión reconoce situaciones y peticiones mediante reglas. Conoce las capacidades del programa y puede proponer transformaciones concretas. No incluye un modelo de lenguaje general que comprenda y escriba cualquier historia de manera autónoma.

Para asistencia con un modelo se pueden configurar conexiones de texto, entre ellas Ollama, Anthropic, Gemini, OpenAI y servicios compatibles. Ollama requiere un servicio y un modelo local preparados por el usuario. Los adaptadores de imágenes y voz son independientes: elegir un proveedor para texto no garantiza que esa conexión produzca todos los medios.

El co-director dispone de un catálogo de escenas con finalidad narrativa, parámetros y recursos necesarios. Conoce la ganzúa, la exploración ilustrada, el escritorio, la combinación, la terminal y los circuitos, además de novela visual, inventario, tipografía y audio. El aprendizaje de las demos se incorporó a ese catálogo y a las instrucciones enviadas a los proveedores.

El modelo solicita herramientas de autoría. Estas modifican un borrador mediante operaciones reconocidas y validación del manifiesto. Una ruta reservada para una imagen que todavía no existe se presenta como un recurso pendiente; no se declara una imagen generada solo por inventar su nombre.

Las decisiones editoriales siguen siendo humanas: qué cambiar, cuánto dura una escena, qué aporta un acertijo, qué interpretación resulta adecuada y si la historia conserva su intención. Una conexión de IA no sustituye la revisión del relato ni la comprobación de sus salidas.

## 10. Cómo compartir la obra

En **Exportar** se puede elegir uno, dos o los tres formatos. La aplicación prepara archivos independientes por formato. No divide un final en un archivo y otro final en otro: cada salida conserva las ramas y desenlaces de la obra.

| Salida | Qué recibe el lector | Cómo se utiliza |
| --- | --- | --- |
| Web/PWA | Una aplicación web con recursos de la obra. | Se aloja en un servidor estático. Tras la precarga correcta puede utilizar su caché sin conexión. |
| Audio-drama | Una experiencia web de escucha con controles y decisiones. | Se publica o sirve por HTTP como la salida web. No es un MP3 lineal. |
| Escritorio | El lector nativo acompañado de la carpeta de la obra en la salida portátil. | Se extrae el ZIP completo y se mantienen juntos el programa y sus recursos. |

El lector se compila para el sistema de destino; la aplicación Windows no es un compilador universal para obtener desde el mismo botón cualquier paquete macOS o Linux. Hay infraestructura multiplataforma en el proyecto, pero la distribución 0.2.0 comprobada en esta entrega es Windows x64.

La preparación guarda primero y comprueba la obra, los recursos y las voces necesarias. Los errores de integridad pueden bloquear la publicación. Las rutas multimedia ausentes se diagnostican; las opciones explícitas de borrador no equivalen a una publicación terminada. El autor debe revisar los avisos y probar el archivo obtenido.

Un ZIP web no constituye una publicación en internet. Se necesita alojarlo y comprobar la URL. Abrir un HTML directamente con `file://` puede impedir cargas que necesitan HTTP. La publicación en GitHub Pages de cuentos de demostración se realizó como una operación externa autorizada; no existe todavía un servicio integrado de Studio que publique cualquier obra automáticamente en una cuenta del usuario.

### 10.1 Prueba antes de compartir

Conviene recorrer todas las elecciones y finales, intentar respuestas incorrectas y abandonar los minijuegos. Un fracaso debe conducir a una situación prevista, no dejar al lector sin camino. También se revisan el silencio global, el retardo de sonidos, la coherencia del inventario y la claridad de los textos auxiliares.

La fuente editable y la publicación tienen usos distintos. Se conserva la carpeta `.duvarret` para editar, y se comparte el formato elegido para leer. Si el destinatario va a continuar la autoría, necesita el proyecto completo y sus recursos.

## 11. Guardado, privacidad y respaldo

En Windows, las obras nuevas gestionadas por Studio se guardan en `%APPDATA%\engine.duvarret.studio\obras`. La biblioteca personal está en `%APPDATA%\engine.duvarret.studio\biblioteca`, con `catalogo.json` y la carpeta `assets`. Las obras externas permanecen donde se crearon o abrieron.

El catálogo de obras se guarda en el perfil local del Studio bajo la clave `duvarret:mis-obras-v1`. Migra inicialmente desde `duvarret:obras-recientes`. En navegador, los proyectos usan almacenamiento del sitio y sus archivos multimedia se guardan en IndexedDB; cambiar de navegador o borrar sus datos no equivale a trasladarlos a otra cuenta.

El perfil de autor no contiene las claves de IA. En Windows, las credenciales de proveedores se almacenan por separado, cifradas con DPAPI para el usuario del sistema. No se incorporan al manifiesto ni a los ZIP de la obra. La implementación web mantiene las claves de conexión en memoria de sesión; no debe suponerse que seguirán disponibles tras recargar o cerrar el navegador. El almacén nativo protegido actual está implementado para Windows.

Una copia de seguridad útil incluye las carpetas completas de obras, la biblioteca personal y los datos del perfil que se quieran recuperar. Exportar solo la versión final no protege toda la información de autoría. Tras cambiar de equipo también hay que revisar las ubicaciones del catálogo y configurar las conexiones de IA; un nombre de perfil local no sincroniza archivos ni credenciales.

Actualizar el programa con el mismo identificador de aplicación conserva el lugar de sus datos. Aun así, el respaldo debe ser independiente de la carpeta del ejecutable. No se debe borrar una carpeta con aspecto de prueba si el sistema la tiene registrada como instalación activa.

## 12. Arquitectura técnica

### 12.1 Capas y responsabilidades

| Capa | Responsabilidad | Ubicación principal |
| --- | --- | --- |
| Núcleo de autoría | Esquema, validación, integridad, herramientas, importación, recursos, lore y compilación. | `src/core/` |
| Reproductor | Estado de lectura, navegación, texto, módulos interactivos y audio. | `src/runtime/` |
| Studio | Interfaz Vue, estado de proyecto, asistente, bibliotecas y servicios. | `src/studio/` |
| Entrada del lector | Montaje del reproductor como salida independiente. | `src/player/` |
| Shell nativo | Acceso a disco, credenciales, transporte permitido, síntesis y distribución. | `src-tauri/` |
| Herramientas | CLI, preparación de voz, compilación, verificación y medidas. | `scripts/` |

La interfaz utiliza Vue 3, TypeScript, Pinia y Tailwind CSS 4. Vite prepara las salidas de Studio y del reproductor. El escritorio utiliza Tauri v2 y Rust; la interfaz se ejecuta en el motor web del sistema. No se distribuye un motor completo de videojuegos para cada escena.

Separar núcleo, Studio y runtime permite reutilizar el mismo contrato para la vista previa, la publicación web y el lector nativo. Las pruebas pueden comprobar una transición o la integridad de un camino sin montar toda la interfaz.

### 12.2 Manifiesto declarativo

`manifest/story_manifest.json` describe la obra. Sus familias principales son metadatos, configuración global, personajes, objetos, entorno acústico y nodos narrativos. Los nodos contienen texto, tipografía, eventos acústicos, superposiciones de diálogo o juego, comprobaciones y navegación.

El esquema ejecutable está en `src/core/manifest/schema.ts` y los valores reconocidos en `src/core/manifest/catalog.ts`. El JSON Schema derivado está en `schemas/story-manifest.schema.json`. La versión de ese contrato no es el número del instalador: la aplicación 0.2.0 utiliza el contrato de runtime definido en el catálogo.

El validador normaliza entradas y devuelve diagnósticos. La integridad detecta referencias y destinos inválidos, identificadores duplicados y otros problemas que una estructura JSON correcta no revela. Ciertos campos desconocidos o capacidades no disponibles utilizan fallbacks; esto no autoriza a ignorar errores que dejan la obra incoherente.

Las modificaciones del agente pasan por `ManifestEditor`, el registro de herramientas y la validación. El manifiesto no contiene código JavaScript arbitrario para ejecutar. Añadir una capacidad implica ampliar sus contratos, representación, recursos, adaptación accesible y pruebas.

### 12.3 Estructura del proyecto en disco

```text
Mi_obra.duvarret/
  project.duvarret.json
  manifest/
    story_manifest.json
  manuscript/
    raw/
    beats/
  knowledge/
    lore_graph.db
  assets/
    registry.json
    audio/
    images/
    typography/
  export/
```

Los metadatos identifican el proyecto y su modo de trabajo. El manifiesto define la experiencia. El registro de recursos conserva procedencia, estado y rutas. La base de lore guarda información estructurada cuando se utiliza. `export` contiene salidas regenerables; no reemplaza los originales de `assets`.

La biblioteca personal nativa tiene una estructura compartida: `biblioteca/catalogo.json` y archivos con nombres derivados de SHA-256 en `biblioteca/assets`. La cola de cambios del servicio serializa operaciones dentro del proceso. Las copias a proyectos utilizan sus almacenes propios.

### 12.4 Estado narrativo y continuidad

El reproductor mantiene nodo actual, indicadores, inventario, historial y resultados de comprobaciones. Las condiciones determinan qué elecciones aparecen o se habilitan. Los efectos de una transición actualizan el estado antes de continuar.

El subsistema de lore utiliza datos locales estructurados y persistencia SQLite. Permite registrar entidades y relaciones y apoyar las comprobaciones de continuidad. No equivale a una comprensión infalible del argumento: las contradicciones detectables dependen de los hechos registrados y de las reglas implementadas.

En el navegador hay implementaciones de almacenamiento y acceso al lore adaptadas a ese entorno. El contrato de proyecto permite abrir fuentes en disco mediante Tauri y mantener otras en el almacenamiento del dispositivo.

### 12.5 Motor acústico y representación

La reproducción utiliza Web Audio. Resonance Audio aporta la ruta de salas envolventes; existe una alternativa binaural HRTF y una ruta estéreo simple. Si falla Resonance o faltan capacidades, el motor selecciona una alternativa y comunica avisos.

El valor histórico `steam_audio_wasm` del contrato se representa actualmente mediante una aproximación de sala y HRTF; no demuestra que haya un motor Valve Steam Audio con trazado de rayos WASM plenamente integrado. La distinción evita confundir un nombre reservado del esquema con una dependencia implementada.

El motor gestiona carga, caché, voces, mezcla, fuentes con posición, ambientes y cancelación al cambiar de escena. Las marcas se observan respecto a la ventana visible y los contenedores de lectura, con control para no repetir el evento en una visita. La tipografía combina estilos y representación gráfica con alternativas cuando corresponde.

### 12.6 Co-director y generación multimedia

Los adaptadores de texto exponen una interfaz común. El orquestador construye contexto, comunica las posibilidades, recibe peticiones de herramientas y prepara resultados revisables. El lore y el catálogo de escenas forman parte del contexto disponible según el recorrido.

La generación multimedia conserva la procedencia y valida los bytes antes de aceptar un archivo. Los resultados provisionales pueden vivir en memoria como borradores. La aceptación los incorpora a la obra; la recopilación personal añade otra copia cuando está activada. Esta secuencia diferencia proponer, generar, aceptar y utilizar un recurso.

Los proveedores pueden fallar por conectividad, credenciales, cuota o disponibilidad del modelo. Los adaptadores no deben convertir esos fallos en medios falsamente listos. Las configuraciones y los modelos sugeridos por la interfaz son revisables y dependen del servicio real.

### 12.7 Shell, escritura y exportador

Los comandos nativos median el acceso a archivos. Las rutas relativas se validan para impedir recorridos fuera del proyecto. Las escrituras grandes utilizan bloques y archivos temporales, evitando enviar una salida completa como un único mensaje IPC enorme. La publicación del archivo final se realiza después de completar la escritura prevista.

El borrado de obras personales comprueba la ruta canónica y su relación con la carpeta gestionada; rechaza raíces y proyectos externos. El transporte de proveedores aplica restricciones de destino y separa credenciales de los datos exportables. La terminal narrativa no es una vía para ejecutar scripts libres.

`compileBundle` valida la entrada, reúne los recursos referenciados, incorpora el runtime y prepara la salida. La publicación web incluye manifiesto PWA y service worker; su huella cambia con el contenido para invalidar versiones anteriores de la caché. La salida portátil combina el lector y su carpeta `obra`.

El funcionamiento sin conexión de una PWA requiere una primera carga y precarga correctas. Un cambio de origen, restricciones del navegador o la eliminación de sus datos pueden afectar a la caché y al progreso local.

## 13. Desarrollo, construcción y calidad

El entorno local de la entrega Windows dispone de Node.js 24, dependencias fijadas por `package-lock.json`, Rust y herramientas nativas de Windows. La CI usa la versión de Node declarada en su workflow. Desarrollar la aplicación nativa requiere las dependencias de Tauri de la plataforma; instalar Studio no exige instalar esas herramientas.

```text
npm ci
npm run dev
npm run typecheck
npm run lint
npx vitest run --maxWorkers=2
npx playwright test --workers=2
npm run build
npm run build:desktop
```

La CLI también valida y publica proyectos:

```text
npm run duvarret -- validate works/el-corazon-delator.duvarret
npm run duvarret -- export works/el-corazon-delator.duvarret --target web --zip
npm run duvarret -- export works/el-corazon-delator.duvarret --target audio --zip
```

Para Rust se ejecuta `cargo test` dentro de `src-tauri`. El desarrollo de escritorio se inicia con `npm run tauri dev`. La preparación de voz, recursos y ejecutable incluido se mantiene en [la guía del motor de voz](10_MOTOR_VOZ_INCLUIDO.md).

Las verificaciones se distribuyen entre pruebas de lógica y componentes, E2E con navegador, comprobaciones nativas, validación de paquetes y recorridos con obras reales. No toda revisión requiere recompilar el instalador: un cambio exclusivamente documental no modifica el programa. Un cambio en el runtime exige actualizar el lector que se incluirá en las publicaciones.

Las dependencias `@tauri-apps/plugin-*` y sus crates Rust deben mantener versiones mayor y menor compatibles. Los instaladores y modelos son archivos de distribución; las herramientas y los pesos originales de preparación no deben confundirse con basura temporal.

## 14. Estado de referencia y límites comprobados

Studio 0.2.0 incorpora las bibliotecas personales, el perfil local opcional y el borrado protegido. También incluye las correcciones de propuestas con parámetros reactivos y del disparo de marcas visibles al agotar el scroll.

En la entrega se ejecutaron 20 recorridos E2E. La suite unitaria comprobó 446 casos entre la ejecución general y la repetición del archivo cuya espera asíncrona se corrigió. Pasaron tipos, lint y la protección nativa de borrado. El Studio extraído del instalador completó el recorrido de bibliotecas y generó y reprodujo voz Kokoro; sus archivos de voz se cotejaron con los SHA-256 del paquete.

El instalador Windows x64 de referencia ocupa 593.048.775 bytes, aproximadamente 566 MiB, porque incluye el motor de voz, sus recursos y componentes de instalación. Ese tamaño no debe confundirse con el de un lector portátil ni con el de una obra y todos sus audios. Las antiguas metas de ejecutables inferiores a 20 MB no son una promesa para el instalador completo.

Las historias de aceptación han ejercitado navegación, varios finales, inventario, diálogo, marcas con retardo, fracaso de acertijos y exploración. Son evidencias de esos recorridos, no una garantía de que cualquier obra futura carezca de errores. La validación automática ayuda, pero el autor debe probar sus propias rutas y recursos.

La comprobación en el equipo de desarrollo con intérprete privado y rutas externas inválidas no equivale a una instalación certificada en todas las variantes de un Windows limpio. Tampoco se han validado en esta edición todas las conexiones de nube con cuentas reales, todos los lectores de pantalla ni una distribución nueva macOS/Linux. El estado de la fuente local y el de una rama remota o una descarga pública deben distinguirse.

## 15. Evolución pendiente

Las siguientes líneas son ampliaciones o trabajos de validación, no prestaciones que este documento dé por terminadas:

- Ensayar instalación, actualización y recuperación en sistemas limpios y ampliar las pruebas de accesibilidad y dispositivos físicos.
- Completar trabajos persistentes de generación, cancelación y recuperación tras cierre, con estados claros de reparación y reintento.
- Mejorar muestras y dirección de voz, banco sonoro y control editorial, manteniendo procedencia y licencias verificables.
- Integrar publicación alojada desde Studio con autorización explícita, gestión del despliegue y confirmación de su URL.
- Evaluar nuevas opciones de generación de imágenes, música y efectos; una alternativa gestionada sin claves del usuario requiere un servicio, sus costes y su diseño de privacidad.
- Incorporar respaldo recuperable e historial de versiones más completo, y revisar la coordinación de bibliotecas cuando varias instancias editan el mismo archivo personal.
- Preparar firma y actualizaciones de distribución y una aceptación suficiente antes de declarar una versión 1.0.

La prioridad es que una persona pueda crear, escuchar, revisar, compartir y retomar una narración con confianza. Añadir más efectos solo tiene sentido si ese recorrido sigue siendo comprensible y recuperable.

## 16. Cómo orientarse en el repositorio

Para comprender el proyecto y su uso, este documento es la referencia principal. Para arrancar el desarrollo está [README](../README.md). El estado y las próximas verificaciones se mantienen en [el plan vigente](../MASTER_IMPLEMENTATION_PLAN.md).

Las guías especializadas son [validación](06_VALIDACION.md), [publicación](07_PUBLICACION.md), [motor de voz](10_MOTOR_VOZ_INCLUIDO.md) y [verificación del instalador](10_VERIFICACION_INSTALADOR_VOZ.md). Complementan el documento principal sin volver a definir el producto.

Los primeros requisitos, diseños y planes están en [el archivo documental](archivo/README.md), identificados como antecedentes. Pueden explicar de dónde surgió una decisión, pero no deben utilizarse como si describieran por sí solos la versión actual. Para contratos implementados, mandan el esquema ejecutable, el código y sus pruebas.
