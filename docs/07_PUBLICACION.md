# Publicar y compartir una obra

La guía general de uso y formatos está en [el documento principal](PROYECTO_DUVARRET.md). Este documento se centra en la entrega. La guía anterior queda en [archivo](archivo/verificaciones/07_PUBLICACION_ANTERIOR.md) y contiene procedimientos históricos que no deben confundirse con la voz empaquetada actual.

## Desde Studio

1. Revisar texto, caminos, recursos y narración.
2. Abrir Exportar, elegir Web/PWA, audio-drama, escritorio o una combinación.
3. Preparar los formatos seleccionados. Se obtiene un ZIP independiente por formato, cada uno con las ramas y finales de la obra.
4. Leer los avisos y probar cada salida antes de compartirla.

El ejecutable portátil requiere Studio de escritorio y su lector incluido. Se extrae el ZIP completo y se mantiene el programa junto a la carpeta `obra`. Para editar después se conserva la fuente `.duvarret`, no solo la publicación.

## Web y audio-drama

Ambos son reproductores web. El audio-drama conserva decisiones y controles: no es un MP3 lineal. Se extrae el paquete y se sirve por HTTP o se aloja en un servidor estático compatible. Abrir directamente el HTML mediante `file://` no es el procedimiento de publicación.

La PWA prepara caché para lectura sin conexión después de una carga y precarga correctas. Probar una actualización, el origen de la URL y el funcionamiento offline evita confundir una caché antigua con la edición recién publicada.

Studio prepara los archivos; la edición actual no integra un servicio general para publicarlos automáticamente en la cuenta de alojamiento del usuario. Las publicaciones de demos realizadas desde desarrollo fueron acciones separadas y autorizadas.

## Voz incluida y voces de la obra

En el Studio Windows distribuido, Narración y voz utiliza el Kokoro incluido. La aplicación genera y guarda las frases necesarias; al cambiar texto se actualizan las pendientes. Micrófono e importación de audios propios son otras vías disponibles.

Una publicación transporta los WAV y otros recursos finales, no el entorno de síntesis. El lector no necesita Python, los modelos de Kokoro ni las claves del autor. La preparación debe comprobar cobertura de voz y archivos antes de declarar terminada la salida.

La CLI conserva herramientas de desarrollo para narrar y compilar. Su preparación manual no es un paso que deba realizar quien instaló la distribución Windows completa. Ver [construcción de voz](10_MOTOR_VOZ_INCLUIDO.md).

## CLI

```text
npm run duvarret -- validate <carpeta.duvarret>
npm run duvarret -- export <carpeta.duvarret> --target web --zip
npm run duvarret -- export <carpeta.duvarret> --target audio --zip
npm run duvarret -- export <carpeta.duvarret> --target native
```

`native` construye el ejecutable para el sistema y necesita el entorno nativo de desarrollo. La exportación portátil de Studio utiliza el lector que se distribuye con la aplicación. Esas rutas de desarrollo y uso no deben confundirse.

## Firma y alcance de la entrega

El código dispone de preparación opcional de firma mediante `scripts/lib/sign.ts` y secretos de CI. La firma real requiere certificados y comprobación de la distribución; las pruebas de comandos con dobles de prueba no certifican una firma emitida. No se deben guardar certificados ni contraseñas dentro del proyecto o las obras.

Los avisos del sistema y la confianza de distribución dependen del paquete y del entorno. El historial de una compilación anterior no sustituye la verificación de una nueva entrega. La edición Windows 0.2.0 tiene un instalador y huellas SHA256 comprobados; la documentación no la presenta como una versión 1.0 certificada en todas las plataformas.
