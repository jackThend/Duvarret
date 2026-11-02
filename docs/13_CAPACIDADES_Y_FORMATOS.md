# Aprendizajes incorporados al Studio

El cuento de aceptación no deja capacidades ocultas en un guion externo. El catálogo
`src/core/agent/sceneCapabilities.ts` forma parte de la aplicación y se añade a las instrucciones
de todos los proveedores, incluso cuando usan un prompt propio. `listSceneCapabilities` permite
consultarlo durante una conversación.

## Escenas que el director puede sugerir

Ganzúa, búsqueda ilustrada con linterna, escritorio de expedientes, combinación, terminal y
circuitos. El catálogo incluye finalidad narrativa, parámetros de ejemplo y recursos necesarios.
El director también conoce novela visual, inventario, tipografía transformable y audio espacial
con marcas, retardo y movimiento. El botón «Explorar escenas posibles» lo hace visible al autor.

El director local reconoce la ganzúa y la búsqueda con linterna tanto en peticiones como en la
prosa de las propuestas automáticas. Distingue la linterna de búsqueda de la que revela letras y
no propone sustituir un módulo ya presente. Las propuestas siguen requiriendo aceptación.

`defineInventoryItem` registra objetos sin concederlos inmediatamente. El resultado de búsqueda
usa `on_success.grant_items`, con identificadores propios de cada escena. Si falta la imagen del
cuarto, la ruta reservada se declara como recurso pendiente y el exportador la avisa: no se anuncia
como una imagen generada. El catálogo recuerda aportar archivos reales, ofrecer salidas de fracaso
y dejar leer el expediente después de resolverlo.

## Elegir los formatos finales

En Compartir se puede seleccionar Web, audio-drama, ejecutable o cualquier combinación. El botón
«Descargar formatos seleccionados» prepara un ZIP independiente por formato; no un paquete común
ni una obra diferente por desenlace. Todos conservan las ramas y finales originales.

Web y audio-drama son experiencias web publicables. Audio-drama incluye decisiones y guion, no es
un MP3. El ejecutable se prepara desde Studio de escritorio para el sistema del equipo; su ZIP
incluye programa y carpeta `obra`. Se conservan permisos de ejecución para sistemas Unix.

La preparación guarda primero, valida todas las salidas elegidas, detecta cambios concurrentes y
recursos pendientes, y después guarda los archivos por separado. Si una escritura falla después
de otra, informa qué formatos ya están guardados. La escritura de archivos grandes sigue usando
bloques nativos. Los botones individuales anteriores también permanecen disponibles.

La aceptación incluye catálogo recibido por un proveedor remoto simulado, director local ejecutando
herramientas sobre un borrador, propuestas automáticas, selección de formatos, ZIP nativo con binario
y manifiesto, tipos/lint y CI. Los cambios de Studio requieren recompilar Studio; el lector se puede
reutilizar si no cambia su runtime.
