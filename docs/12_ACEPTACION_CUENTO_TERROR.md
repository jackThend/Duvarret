# Aceptación nativa: La casa que aprendió mi nombre

Prueba solicitada el 01-11-2026 antes de fusionar el PR #6. Se usa un relato original de horror
cósmico de 12 escenas, unas 1.300 palabras y dos finales; no se reciclan grabaciones de las demos.

## Recursos gratuitos y alcance

| Recurso | Opción usada | Alcance real |
|---|---|---|
| Voz de lectura | Kokoro incluido, Dora | Local, sin clave ni cuota por generación. Requiere recursos del instalador y CPU. |
| Réplicas situadas en el espacio | Kokoro, Dora y Alex | WAV nuevos generados por el motor del ejecutable. No se demuestra clonación ni actuación emocional arbitraria. |
| Lluvia, mar, viento y puerta | Joseph SARDIN, LaSonothèque / BigSoundBank | Grabaciones reales CC0, descargadas sin cuenta ni clave. Fuentes y hashes en los créditos de la obra. |
| Música | «El compás que sobra», composición procedural original | Síntesis local; no se anuncia como un generador musical de IA integrado. |
| Golpes, pasos y estampido | Foley procedural original | Sintetizado localmente; se distingue de las grabaciones de campo. |
| Imágenes | Cubierta generada en esta sesión y SVG originales | La cubierta de esta prueba no prueba que cualquier proveedor remoto de imágenes sea gratuito. |

Fuentes primarias consultadas: [licencia de BigSoundBank](https://bigsoundbank.com/licenses.html),
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), [licencias de Freesound](https://freesound.org/help/faq/),
[assets CC0 de Kenney](https://kenney.nl/support). ElevenLabs es una alternativa remota con cuotas y
condiciones propias: no se utiliza ni se gastan créditos de proveedores en esta aceptación.

También existen proveedores locales de texto en Duvarret. El director local de reglas no equivale
a un LLM generativo; usar un modelo local mediante Ollama depende del hardware y de la licencia del modelo.

## Ampliaciones necesarias

- `room_search`: cuarto ilustrado con linterna, recogida por ratón, tacto o teclado y resultado de
  inventario. No permite recoger el objeto fuera de la luz. Su imagen se incluye en la exportación.
- `lockpick`: tres pernos de altura ajustable, intentos y recuperación; accesible mediante teclado.
- Corrección del diagnóstico `dead_end`: un enigma obligatorio puede continuar mediante elecciones
  desbloqueadas por su resultado, además de mediante una transición automática.
- Exportación nativa por bloques de 256 KiB, con archivo temporal y publicación al completar la
  escritura. Evita enviar un ZIP completo como millones de números en un único mensaje IPC.
- El escritorio ficticio conserva abierto su expediente después de resolver el objetivo; antes
  desaparecía antes de que el lector pudiera leer la pista. Incluye prueba de regresión.

En este cuento las salidas de fracaso de la búsqueda, la ganzúa y el sello conducen explícitamente
al desenlace `nombrar`. El motor conserva los puzles completados durante la partida; no se presenta
un regreso a ellos como si permitiera reintentarlos.

Los módulos están disponibles en `mountSimulatedModule`; el manifiesto se construye mediante
`ManifestEditor` y se valida, sin JSON editado a mano.

## Reproducir la preparación

1. `npx tsx scripts/preparar-cuento-terror.ts <carpeta-nueva.duvarret>` prepara relato y SVG sin
   sobrescribir archivos existentes. La cubierta se aporta por separado; las grabaciones se obtienen
   con `node scripts/descargar-ambientes-terror.mjs <carpeta.duvarret>` (antes del builder si se desea
   que figuren como listas desde el inicio).
2. `npx tsx scripts/preparar-audio-terror.ts <carpeta.duvarret>` crea música y foley originales.
3. Compilar Studio y el lector actuales mediante `scripts/build-windows.ps1 -SinInstalador`.
4. `node scripts/verificar-cuento-terror.mjs --app <Studio.exe> --work <carpeta.duvarret>` genera
   réplicas con el comando nativo y narración desde la interfaz, comprueba guardado/reapertura y
   exporta Web y portátil. Después recorre los controles del lector exportado.

El guion utiliza un perfil WebView2 aislado, un PATH mínimo y variables de Python externas
deliberadamente inválidas. No modifica credenciales ni la instalación existente del usuario. Solo
termina los procesos que inicia. Conserva capturas e informe en la carpeta de verificación.

## Evidencias y límites

El lector recompilado superó ambos desenlaces, el expediente legible, linterna e inventario,
ganzúa por teclado, sello 314, novela visual y efectos tipográficos. Las marcas se escucharon
una sola vez por visita, con retardos observados de 1.234–1.273 ms para una configuración de
1.200 ms. La exportación Web y portátil conserva el marcador y su retardo. La narración del
lector utiliza el WAV de Kokoro y no la síntesis de voz del sistema.

Los intentos iniciales detectaron un asset de pasos ausente, transporte IPC demasiado grande y
el expediente ocultado al resolverlo. Se corrigieron el generador de foley, la escritura por bloques
y la conservación del escritorio resuelto, respectivamente.

Entrega local: `terminados/la-casa-que-aprendio-mi-nombre/`. El resultado verificable se escribe en
Los informes `verificacion*/VERIFICACION.json` conservan cada intento, con `status: passed` o
`failed`; no inferir éxito solo del arranque. Los intentos anteriores documentan los fallos encontrados.
Los ejecutables, imágenes, grabaciones y capturas permanecen fuera de Git, conforme a las exclusiones
del proyecto. El PR contiene código, guiones y este informe de aceptación.

Esta prueba se ejecuta en el equipo de desarrollo. No certifica una VM Windows limpia, firma de
editor, una instalación nueva ni aceptación auditiva humana. Offline de WebView2 no equivale a
desconectar la red del sistema operativo. No publicar la obra ni fusionar el PR automáticamente.
