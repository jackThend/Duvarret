# Revisión de autoría tras la demo

Objetivo: que una persona que escribe pueda editar, conservar, escuchar y compartir su obra sin conocer formatos ni comandos. Se mantiene la identidad editorial del Studio. La evaluación utiliza El último minuto y El archivo de las mareas como obras reales.

## Cambios aplicados

El guardado automático espera una pausa breve al escribir, serializa las escrituras y conserva el estado pendiente si se produce un fallo. La barra comunica si está guardando, si hay cambios o si todo quedó guardado. Los fallos aparecen con una acción para reintentar; el cierre nativo espera el guardado. Deshacer y rehacer tienen controles visibles. Los títulos se actualizan al escribir y permiten corregir temporalmente un campo vacío.

El inicio ofrece un recorrido por los pasos de creación. En pantallas estrechas, Escenas, Escribir y Vista previa se convierten en vistas seleccionables en vez de comprimir tres paneles. Las secciones vacías no llenan la barra lateral. Los términos se dirigen al escritor: personajes y relaciones, texto expresivo y sonido espacial.

Los diálogos retienen el foco, permiten Escape cuando procede y devuelven el foco al control de origen. Durante una exportación no se pueden cerrar accidentalmente. Los atajos de la aplicación respetan los campos de texto y los diálogos. Quitar un personaje del mapa requiere una confirmación contextual.

Compartir guarda antes de compilar, comprueba que la obra no cambió de identidad y ofrece reparar la voz pendiente desde el propio aviso. El resultado explica dónde quedó la publicación y cómo abrir su carpeta. Se distingue una web para móviles de un ejecutable para Windows; exportar no se presenta como publicar en internet. Un paquete de audio no se presenta como un MP3. Los recursos físicos ausentes bloquean la publicación salvo elección explícita de borrador; la voz natural incompleta siempre bloquea.

La vista de narración evita reproducir una grabación de texto antiguo. Los detalles técnicos quedan plegados y los errores de preparación de voz se explican con un siguiente paso. La voz y su interpretación se conservan al actualizar. Los menús condicionales incluyen las distintas numeraciones posibles en su catálogo de grabaciones.

El lector comienza sin música, efectos ni voz. Hay un control global visible tanto en lectura como en escucha. Cambiar de escena no anula el silencio. El modo de escucha dispone de opciones táctiles y entrada táctil de códigos. Los enigmas de la nueva demo proporcionan pistas textuales y consecuencias que permiten seguir si se falla.

## Verificación y límites

Las pruebas unitarias cubren errores y recuperación de guardado, foco, publicación de borradores, bloqueo del cierre durante exportación, cola de voz, silencio y menús condicionales. Las verificaciones reales se guardan junto a las obras: Windows sobre copia editable, navegador de escritorio, vista móvil y PWA sin conexión. Los informes registran únicamente comprobaciones efectivamente ejecutadas.

Verificación final de Windows completada el 20 de octubre: Studio release de 6.270.976 bytes guarda automáticamente, deshace y rehace, genera la voz pendiente sin cerrar, reutiliza después las grabaciones, exporta un ZIP real y guarda al recibir el cierre de la ventana. El lector release de 4.831.232 bytes carga la nueva obra desde `obra/`, comienza en silencio y reproduce sus WAV sin solapamientos ni síntesis del navegador. Se revisaron las capturas de escritorio y de 390 px; los proyectos originales permanecieron intactos durante esas pruebas.

El equipo de autoría actual tiene preparados los modelos locales de voz. Llevar Studio a otro equipo todavía puede requerir preparar ese motor; el ejecutable no incluye todos sus pesos. Una publicación web lleva las grabaciones listas y el lector no necesita modelos. El alojamiento web y el alta de GitHub siguen siendo pasos externos: el resultado de Exportar explica esa diferencia. No se afirma que exista un publicador automático de GitHub dentro de Studio.
