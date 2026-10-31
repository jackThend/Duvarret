# Plan de Duvarret 1.0: crear desde una instalación limpia

Fecha de auditoría: 20 de octubre de 2026. Las fases conservan el plan original; los avances posteriores se registran al final. Prioridad: escritores no técnicos. Primera plataforma objetivo: Windows; ampliar la promesa a macOS/Linux cuando pasen las mismas pruebas de instalación y uso.

## Decisión propuesta

Distribuir un Studio completo con editor, narración local, sonidos y ejemplos listos al instalar. Ofrecer imágenes y asistencia literaria mediante un servicio integrado opcional; reservar los modelos locales grandes para paquetes avanzados compatibles con el equipo. Permitir elegir proveedor/modelo en ajustes avanzados, sin obligar al escritor a hacerlo para comenzar.

La edición, el guardado, la voz incluida y la reproducción deben funcionar sin cuenta ni internet. Una generación en la nube requiere conexión y un servicio financiado; el usuario debe conocerlo antes de usarla. Un modo completamente local necesita modelos adicionales y hardware comprobado. No prometer máxima calidad, rapidez, gratuidad e independencia del hardware simultáneamente.

El lector exportado sigue siendo ligero y contiene las grabaciones e imágenes finales. No necesita motores de IA. El instalador de autoría sí puede ocupar cientos de MB: el límite del reproductor no debe impedir incluir una voz utilizable.

## Fase 0 · Descubrimiento y evidencia, completada para este plan

### Qué se usó realmente en las demos

Se utilizó el motor, manifiesto validado, narración, compilador y reproductor reales de Duvarret. La autoría completa también utilizó scripts con `ManifestEditor`, generación de ilustraciones desde la herramienta externa de Codex y publicación con GitHub CLI. Se prepararon Python, bibliotecas y modelos en este equipo. Eso demuestra la capacidad del motor y la integración de esos resultados, pero no un recorrido completo desde una instalación limpia usando solo la interfaz de Studio.

### Estado comprobado en el código

| Área | Evidencia | Situación |
| --- | --- | --- |
| Edición, guardado, ramas y reproducción | `src/studio/`, `src/runtime/`; informes reales en `terminados` | Funcionales en los casos probados; falta aceptación externa en equipos limpios. |
| Generación de imágenes/SFX desde el director | `src/studio/stores/studio.ts:120`, `src/core/assets/registry.ts:106` | Se inyecta `OfflineSynthesizer`: devuelve una ruta pendiente, sin generar bytes. |
| Elección de modelo | `src/studio/components/SettingsDialog.vue:48`, `src/core/agent/providers/index.ts:8` | Selector del asistente de texto; no de imagen o sonido. |
| Director local | `src/core/agent/localDirector.ts:2` | Reglas heurísticas, no un LLM distribuido. Ollama se conecta a una instalación externa. |
| Voz real | `src/studio/services/narration.ts:12`, `src-tauri/src/narration.rs:83`, `scripts/synthesize-narration.py` | Kokoro local funciona. Interpretaciones Natural/Dulce; no selector completo de motores o voces. |
| Instalación de voz | `src-tauri/src/narration.rs:15`, `scripts/build-desktop.ts:26` | Busca `.cache/voz`, Python de Codex o del sistema. El empaquetado solo añade el reproductor como recurso. |
| Secretos | `src/studio/stores/studio.ts:103` | La configuración completa, incluida la clave si se introduce, se guarda en localStorage. Debe cambiar antes de una distribución comercial. |
| Publicación | `src/studio/services/exporter.ts`, `docs/08_AUDITORIA_UX_DEMO.md` | Exportar ZIP/aplicación funciona; obtener un enlace requirió herramientas externas. |
| Versión | `package.json:4`, `src-tauri/tauri.conf.json:4` | Los metadatos siguen en 0.1.0. Cambiar el número no sustituye la aceptación de producto. |

Los pesos locales actuales suman 353.719.767 bytes: `kokoro-v1.0.onnx` y `voices-v1.0.bin`, aproximadamente 354 MB decimales o 337 MiB. Las bibliotecas actuales de `.cache/voz/runtime` suman otros 132.762.966 bytes, sin contar el intérprete externo. Estas cifras son archivos del equipo de desarrollo, no el tamaño definitivo del instalador.

### APIs y patrones existentes permitidos

- `AssetSynthesizer.synthesize(request: SynthesisRequest): Promise<SynthesisResult>` en `src/core/assets/registry.ts:91`; el contrato devuelve ruta, estado y proveedor. Extenderlo para medios reales con capacidades, configuración, progreso y cancelación; las nuevas interfaces se diseñarán explícitamente, no se darán por existentes.
- `synthesizeNarration(root, plan, progress)` llama `invoke('narration_generate', { root, voice, delivery, speed, clips, onProgress })`. Conservar el canal de progreso y la separación entre generación e integración del manifiesto.
- `planNarration` / `applyNarration` en `src/core/narration/plan.ts`: conservar la generación incremental, validación y combinación sobre el texto vigente. La huella debe incorporar además revisión del motor, modelo, voces y pronunciación.
- `ManifestEditor.patchManifest` / `patchNode`, `AssetRegistry.register`, `collectAssetReferences`: usar para integrar y exportar recursos. Ningún proveedor escribe por su cuenta el manifiesto en edición.
- Escritura de WAV temporal y sustitución atómica en `scripts/synthesize-narration.py`; validación de rutas y archivos en `src-tauri/src/narration.rs`.

### Documentación primaria para copiar patrones

- Tauri: [recursos incluidos](https://v2.tauri.app/develop/resources/), [binarios auxiliares](https://v2.tauri.app/develop/sidecar/), [instalador Windows y WebView2](https://v2.tauri.app/distribute/windows-installer/), [actualizador firmado](https://v2.tauri.app/plugin/updater/), [firma de Windows](https://v2.tauri.app/distribute/sign/windows/).
- Modelos: [Kokoro y licencia declarada](https://huggingface.co/hexgrad/Kokoro-82M), [voces y límites](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md), [Qwen3-TTS oficial](https://github.com/QwenLM/Qwen3-TTS), [FLUX.2 klein 4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B).
- Nube: [BFL generación de imágenes](https://docs.bfl.ai/quick_start/generating_images), [ElevenLabs TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [catálogo ElevenLabs](https://elevenlabs.io/docs/overview/models).
- Distribución y credenciales: [OAuth de GitHub y device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow), [Stronghold de Tauri](https://v2.tauri.app/plugin/stronghold/). Elegir el almacén de secretos del sistema para las sesiones; Stronghold es otra opción a evaluar, con gestión de su clave de desbloqueo, no una solución automática sin decisiones.

Antes de cada implementación, volver a leer el ejemplo oficial de la versión fijada. No copiar nombres de modelos, parámetros o endpoints de un proveedor a otro por semejanza.

## Opciones de producto y motores

| Opción | Qué ofrece al instalar | Condición | Decisión propuesta |
| --- | --- | --- | --- |
| Híbrida completa | Escribir, voz local y biblioteca sin conexión; imágenes/asistencia mediante servicio integrado | La nube requiere conexión, sesión sencilla y crédito o plan sostenible | Recomendada para 1.0 de uso general. |
| Totalmente local | También genera imágenes y asistencia sin conexión, una vez instalados los paquetes | Más almacenamiento y hardware; calidad/tiempos dependen del equipo | Edición o paquetes avanzados, con requisitos medidos. |
| Proveedores propios | El autor elige modelos, endpoints y sus claves | Mayor configuración y soporte | Modo avanzado opcional; no recorrido inicial. |

### Voz

Kokoro es la primera candidata para la voz incluida: ya funciona en Duvarret y sus pesos declaran Apache 2.0. Debe superar una evaluación específica en español; no asumir que la demo valida todos los textos. Su documentación reconoce limitaciones con frases muy cortas y pronunciación fuera del inglés.

Qwen3-TTS 1.7B es candidato a paquete local expresivo: declara español y variantes con control por instrucciones. Su ejemplo oficial utiliza PyTorch/CUDA. No se ha probado aquí ni se ha verificado un mínimo oficial de RAM/VRAM; no convertir el tamaño de sus pesos en requisitos de hardware. No prometer acento latinoamericano perfecto ni superioridad hasta escuchar resultados comparables.

ElevenLabs es una opción de voz premium en la nube a ensayar. `eleven_multilingual_v2` está documentado para narración estable y español. Una modalidad premium no cambiará silenciosamente a otra voz al perder conexión o crédito. Revisar las condiciones reales de servicio y tratamiento de textos antes de prometer privacidad específica.

Piper puede evaluarse para equipos modestos: el motor actual declara GPL-3.0 y cada voz necesita revisión propia. No se considera automáticamente de mayor naturalidad ni un sustituto directo sin revisar su distribución. Fuentes: [motor](https://github.com/OHF-Voice/piper1-gpl), [ejemplo de voz española](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_ES/sharvard/medium/MODEL_CARD).

### Imágenes

Para una instalación generalista, integrar primero un proveedor en la nube con resultados evaluados y referencias de personajes. BFL es candidato: su API devuelve un identificador y `polling_url`; el backend debe guardar el resultado, no dejar la obra enlazada a una URL temporal.

FLUX.2 klein 4B es candidato local con licencia Apache 2.0 declarada y soporte de referencias. El fabricante cita aproximadamente 13 GB de VRAM. Ese dato no demuestra viabilidad universal ni el rendimiento dentro de Duvarret; medir la configuración exacta antes de ofrecerlo a un equipo. El tamaño completo del repositorio tampoco equivale al paquete mínimo necesario.

Para equipos sin GPU adecuada, ofrecer nube, importación o recursos incluidos. Se puede investigar una modalidad compatible mediante [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp), fijando revisión y modelo; su soporte de CPU no garantiza la calidad o velocidad de las ilustraciones de la demo. No hacer obligatoria una descarga de imágenes de muchos GB.

### Música y efectos

Kokoro y Qwen3-TTS son motores de voz: no generan música ni efectos. La 1.0 debe incluir un banco pequeño y cuidado de ambientes, música en bucle y efectos con procedencia y permisos comprobados. Las demos usaron síntesis PCM original. La generación musical por IA puede ser una ampliación, con evaluación y condiciones propias; no es requisito para que la primera instalación suene bien.

## Fase 1 · Instalador completo y voz local autocontenida

**Dependencia:** fase 0. Es la primera entrega; no esperar a tener todos los proveedores.

**Implementación:** tomar el patrón oficial de `bundle.resources` y/o `bundle.externalBin` de Tauri y empaquetar un motor de voz autónomo con dependencias, fonemización, modelos y voces versionados. Para reducir riesgo, conservar inicialmente la síntesis validada y distribuir su runtime de forma autocontenida; cambiar a ONNX nativo solo si pasa equivalencia. Resolver archivos desde recursos y datos de la aplicación, no desde ancestros del proyecto, PATH o carpetas de Codex. Añadir biblioteca sonora y una obra ejemplo editable. Preparar instalador NSIS/MSI y el modo documentado de instalación offline de WebView2 cuando corresponda.

**Referencias copiables:** documentación Tauri de recursos/sidecars/Windows; generación y WAV atómico actuales; `scripts/build-desktop.ts`; `src-tauri/src/narration.rs`.

**Aceptación:** en VM Windows limpia, sin Node, Python, Codex, Ollama, repositorio ni cachés, instalar, desconectar internet, crear una obra, producir voz, editar una frase, actualizarla y exportar un lector. Repetir con rutas con espacios y tildes, usuario estándar y equipo sin GPU dedicada. El lector funciona sin los motores del autor.

**Guardas:** prohibido descargar código o ejecutar pip durante el primer intento de narrar; no depender de directorios de desarrollo; no marcar voz lista sin una prueba real. Auditar licencias de todo el conjunto, no solo pesos.

## Fase 2 · Generación fiable y selección comprensible

**Dependencia:** fase 1 para la voz incluida; proveedor nube puede desarrollarse después sobre el mismo contrato.

**Implementación:** tomar la cola/canal de progreso actual y ampliarlos a trabajos persistentes con identificador, cancelar, reintentar, reanudar y recuperación tras cierre. El editor sigue disponible. Los recursos terminados se validan antes de registrarse. Un resultado de una escena antigua no sustituye una edición nueva. Integrar estados de motor listo/no disponible/actualización/reparar y descargas opcionales reanudables con revisión, tamaño y SHA256. Instalar modelos actualizados de forma atómica con posibilidad de volver a la revisión anterior.

La interfaz separa **Asistente**, **Ilustraciones**, **Voz**, **Música y efectos**. Por defecto muestra estilo visual, voz con muestra y calidad recomendada. Los nombres de motores/modelos quedan en Avanzado. Ofrecer únicamente capacidades que el proveedor realmente soporta; referencia, semilla y otros ajustes no se inventan para motores que carecen de ellos. Conservar la elección por obra.

**Referencias copiables:** `AssetSynthesizer`, `ToolRegistry`, `AssetRegistry`, `NarrationDialog`, `planNarration`, integración actual en `src/studio/stores/project.ts`. Nuevos contratos de trabajos y capacidades se documentan antes de implementarlos.

**Aceptación:** cerrar/reabrir, cancelar generación, cortar conexión, agotar espacio y cambiar de escena u obra no pierde prosa ni registra archivos incompletos. Cambiar motor o voz invalida las grabaciones correspondientes. El usuario puede reparar un paquete sin consola.

**Guardas:** nunca declarar `ready` a una ruta reservada sin bytes; nunca borrar el resultado anterior antes de validar el nuevo; no bloquear la escritura por una generación; no mezclar proveedores sin reflejarlo en la obra.

## Fase 3 · Calidad de narración y sonido en español

**Dependencia:** fases 1 y 2. Elegir los motores finales después de evaluar, no por sus nombres.

**Implementación:** copiar la configuración probada de Kokoro y construir un corpus de al menos 50 casos: prosa, nombres Lía/Nilo, títulos cortos, opciones, ayuda, números, códigos, siglas, signos y diálogos. Comparar con candidatos premium/locales usando el mismo texto y nivel de salida, en escucha ciega. Añadir pronunciación por obra, pausas y una muestra de la voz antes de generar todo. Una voz por obra como valor inicial; reparto con voces distintas sería una elección explícita posterior.

La huella de caché incorpora texto normalizado, proveedor, revisión de modelo y motor, voz o mezcla, velocidad, diccionario y parámetros relevantes. Mantener título → prosa → opciones en la cola única y voz sin reverberación añadida. Música/efectos tienen controles separados de mezcla y un apagado global accesible, inicialmente apagado.

**Referencias copiables:** `src/core/narration/script.ts`, `plan.ts`, `announcer.ts`, `SpatialAudioEngine.ts` y regresiones existentes. Documentación oficial de cada modelo y endpoint para las pruebas nuevas.

**Aceptación propuesta:** evaluación con hispanohablantes ajenos al desarrollo; mediana mínima de 4/5 en naturalidad y claridad para la voz base. Ninguna palabra omitida en los casos de control, nombres/códigos críticos corregidos y cero solapamientos en pruebas automatizadas. Medir tiempo, RAM y cancelación en CPU de referencia; acordar presupuesto de rendimiento con esos resultados antes de fijar requisitos públicos.

**Guardas:** no equiparar variedad de emociones anunciada por un modelo con calidad demostrada; no esconder el cambio a voz del navegador; la vista previa debe corresponder al texto y perfil actuales.

## Fase 4 · Imágenes y asistente de calidad sin gestionar claves

**Dependencia:** fase 2 y servicio financiado/operable. No es una función gratuita ilimitada por incluir un botón.

**Implementación:** copiar el flujo oficial del proveedor elegido en un backend propio autenticado. Duvarret conserva su sesión; el servidor guarda claves, cuotas, estimación de coste, idempotencia, trabajos y resultados. Mostrar uso de nube y coste/crédito antes de enviar. La autorización general del servicio no implica subir una obra completa a todos los proveedores. Enviar el contexto necesario y explicar la política aplicable.

Integrar generar, ver, regenerar y aceptar ilustración desde la escena. Guardar una dirección visual por obra y referencias de personajes cuando el motor lo permita. El autor puede mantener o importar imágenes sin usar IA. Entregar siempre los bytes aceptados al proyecto; la exportación no depende de URLs efímeras. El selector avanzado muestra modelos compatibles y condiciones, no una lista arbitraria de nombres.

Para texto, mantener los adaptadores existentes y añadir la modalidad gestionada. Rotular con claridad el director de reglas local. El modo de Ollama y claves propias sigue siendo avanzado; probarlo con modelos reales y las herramientas requeridas.

**Referencias copiables:** BFL `POST /v1/{modelo}` + `polling_url` devuelta; ElevenLabs `POST /v1/text-to-speech/{voice_id}` con `model_id` compatible; proveedores actuales de texto y `probeProvider`; integración de assets del núcleo.

**Aceptación:** un escritor sin claves genera y acepta una ilustración desde Studio; se conserva estilo y personaje en varias escenas. Fallo, reintento y timeout no cobran dos veces ni pierden el texto. El autor ve el coste y puede cancelar. Exportar y leer funciona después de cerrar sesión o desconectar el servicio.

**Guardas:** ninguna clave de proveedor incrustada en el frontend/instalador; ninguna promesa de retención cero no contratada; no tratar una URL de resultado temporal como archivo permanente; no usar parámetros de otro endpoint. Definir márgenes de coste y condiciones del servicio antes de vender el plan.

## Fase 5 · Publicar y volver a editar desde Studio

**Dependencia:** exportación actual, gestor de trabajos y credenciales seguras.

**Implementación:** tomar el flujo ya comprobado de los repositorios de publicación y trasladarlo a una integración documentada. Primera opción: conectar GitHub una vez en el navegador, elegir página pública y pulsar Publicar. Usar OAuth/device flow según la documentación de GitHub, con registro de aplicación y permisos acotados. No pedir instalar gh ni pegar tokens. Una alternativa de producto es alojamiento propio de Duvarret si se decide financiarlo; así el usuario no necesitaría cuenta GitHub.

Guardar destino de publicación separado del contenido de la obra. Mostrar progreso real y enlace solo después de un despliegue correcto. Actualizar la página conserva la URL y requiere la decisión explícita del autor. Las ediciones locales no se publican automáticamente.

**Referencias copiables:** exportador actual; `PUBLICACION.md` y evidencia de ambos cuentos; documentación oficial de autorización de GitHub. La secuencia de API de repositorio/Pages se documenta y prueba antes de retirar la CLI como herramienta de desarrollo.

**Aceptación:** desde una instalación limpia, publicar una obra, abrir el enlace en un Android físico y volver a publicar una edición conservando el enlace. Fallo de acceso, red o despliegue explica el paso de recuperación. La confirmación muestra con claridad que la obra será pública.

**Guardas:** no subir el repositorio del Studio ni modelos de IA; no confundir ZIP preparado con publicación online; no enviar enlaces a otras personas automáticamente.

## Fase 6 · Seguridad, instalador y aceptación para declarar 1.0

**Dependencia:** todas las funciones prometidas por la edición elegida. Se puede reducir la promesa inicial; no etiquetar como integrada una función que aún requiere intervención técnica.

**Implementación:** copiar el patrón documentado de actualización firmada de Tauri, preparar firma de distribución y política de recuperación. Migrar secretos desde localStorage al almacén seguro elegido y retirar la copia antigua solo tras guardar correctamente. Hacer coherentes endpoints configurables, permisos y CSP; preferir puentes nativos acotados para secretos/red, sin abrir conexiones indiscriminadamente. Añadir copias de seguridad recuperables y migraciones de proyecto probadas.

**Referencias copiables:** Tauri updater/firma/recursos; `src/studio/stores/studio.ts:103`; CSP de `src-tauri/tauri.conf.json`; pruebas de guardado, exportación y Windows existentes; CI actual como base de comprobaciones, no prueba suficiente de instalación limpia.

**Aceptación final:**

1. Instalar y desinstalar en Windows limpio sin herramientas de desarrollo, con voz base disponible offline desde el primer uso. Equipo CPU sin GPU dedicada y otro de la categoría recomendada.
2. Crear e importar, escribir, ilustrar según modalidad, narrar, editar, regenerar, exportar, publicar y continuar una edición usando exclusivamente Studio. El autor no recibe scripts auxiliares.
3. Cinco escritores no técnicos completan el recorrido principal con las ayudas del producto, sin abrir terminal ni recibir instrucciones del desarrollador; registrar dónde dudan y corregir bloqueos antes de ampliar la muestra.
4. Android físico y escritorio: lectura, voz, tres finales, accesibilidad con teclado/lector de pantalla, silencio global y recuperación sin conexión tras completar la carga. Probar además varios cuentos en el mismo origen para detectar interferencias entre cachés PWA.
5. Reinicio, actualización interrumpida, disco lleno, credenciales revocadas, red perdida y generación cancelada conservan la obra y ofrecen recuperación.
6. Ejecutar tipos, lint, suites unitarias/E2E y pruebas nativas afectadas; verificar licencias/avisos y que los builds no dependen de cachés del agente. Medir tiempos, memoria y tamaño del instalador real.
7. Cambiar versiones a 1.0.0 y publicar instalador/documentación solo cuando los criterios de la edición estén cumplidos. Registrar límites de hardware y de servicio comprobados, sin afirmar compatibilidad en plataformas no ensayadas.

**Guardas:** no usar el número de tests como sustituto de pruebas de uso; no prometer que una firma elimina siempre SmartScreen; no demostrar una instalación limpia en el equipo preparado para el desarrollo.

## Orden de trabajo y alcance

Primero, entregar la fase 1 y demostrar voz local autocontenida. Después, trabajos/selección y calidad de español. A continuación, integrar imágenes/asistencia con servicio gestionado y publicación. El cierre de 1.0 es una aceptación sobre el instalador, no un cambio de número.

Los modelos locales grandes y generación musical avanzada pueden quedar para ampliaciones si no pasan rendimiento, calidad y distribución. La biblioteca incluida debe permitir una obra cuidada desde el principio. Elegir el modelo final de cada categoría después de las pruebas comparativas; las opciones citadas son candidatos verificados documentalmente, no modelos nuevos ya integrados o evaluados dentro de Duvarret.

## Avance verificado · 21 de octubre de 2026 · edición híbrida 0.1.0

- Empaquetados el intérprete Python 3.12.10, Kokoro, voces, fonemización, dependencias, CRT app-local y fuentes/licencias; WebView2 offline incluido. El proceso de narración usa únicamente recursos instalados. Corrección de eSpeak para rutas con espacios y tildes, sin rutas 8.3 ni copias externas.
- BYOK implementado por capacidad: texto OpenAI, Anthropic, Gemini, OpenCode Zen y compatible; Ollama y LM Studio mantienen sus opciones locales externas. Imágenes Gemini y Cloudflare Workers AI. Voz Gemini, OpenAI, ElevenLabs y compatible, además de Dora local incluida. Claves protegidas con DPAPI en Windows y excluidas de obras/exportaciones. Selección de modelos sujeta a capacidades y cuotas del proveedor; no se incluyen créditos ni modelos locales de imágenes.
- Guardas del asistente impiden aplicar propuestas sobre ediciones concurrentes más recientes; 17 regresiones focalizadas correctas. Comprobación global de tipos y lint correctos. Las integraciones cloud se probaron con mocks, sin claves reales ni gasto de API.
- NSIS final construido, copiado con SHA256 idéntico y ejecutado realmente sobre una instalación propia aislada. Aceptación final PASS desde el Studio instalado: credenciales ficticias, voz real sin clips previos, reproducción, una frase editada, siguiente generación cero, exportación del lector y reproducción grabada sin voz del sistema. Informe: `terminados/instalador-hibrido/prueba con tilde á-ExGGZ7/VERIFICACION-INSTALACION.json`; procedencia y hashes en la carpeta de entrega.
- Instalador: 592.265.712 bytes; SHA256 `E52D1E90D5B91DC273C64C8761733C7D33E11CE9A5223AEA337A44C034D27C1E`. Versión técnica conservada en 0.1.0. La instalación de prueba persistente permanece en `prueba con tilde á-1DVH0y/Instalación aislada`, con su entrada de Windows apuntando allí.

Esto completa el empaquetado y la aceptación acotada en este equipo; no cierra íntegramente las fases originales. Siguen pendientes la aceptación en VM Windows limpia y usuarios externos, firma de editor, evaluación auditiva amplia, trabajos persistentes/cancelación según el plan, servicio gestionado sin claves y publicación integrada. Windows Sandbox no estaba disponible. No se certifica 1.0 ni otras plataformas. Los ejecutables y obras de entregas anteriores no se sustituyeron.
