# Construcción y verificación del motor de voz Windows

El paquete `dist-voice/` se incluye como recurso Tauri `voice/`. Contiene `python/python.exe`, biblioteca estándar aislada, `runtime/`, `modelos/`, fuentes/licencias y `package.json` con versiones, tamaños y SHA256. El lector exportado no lleva el motor: solo las grabaciones finales.

## Construcción

1. Preparar las dependencias de síntesis fijadas en `.cache/voz/runtime` y los pesos `kokoro-v1.0.onnx`, `voices-v1.0.bin` en `.cache/voz/modelos`. No se ejecuta pip durante la construcción normal ni al abrir Studio.
2. Obtener el ZIP embebido x64 oficial `https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip` en `.cache/native-build/downloads/`. SHA256 esperado, cotejado con el paquete CPython del SBOM oficial: `4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3`. SBOM: la misma URL terminada en `.spdx.json`.
3. Ejecutar `node scripts/prepare-voice.mjs`. Solo regenera el destino fijo `dist-voice`, nunca proyectos ni cachés originales. Excluye pruebas, bytecode, lanzadores pip, SoundFile y sus dependencias; conserva licencias y fuentes.
4. Ejecutar `node scripts/verify-voice-package.mjs`. También acepta una carpeta `voice` instalada o copiada como primer argumento.
5. `npm run build:desktop` prepara el paquete antes de compilar Studio. En Windows se genera NSIS, instalación por usuario en español y WebView2 `offlineInstaller`. `bundle.useLocalToolsDir` conserva herramientas y descargas en `src-tauri/target/.tauri/`. La preparación del instalador necesita descargar WebView2 desde Microsoft durante la construcción; el usuario recibe ese instalador integrado y no necesita conexión.

Cuando un arreglo afecta solo al Studio y el reproductor existente ya pasó aceptación, `scripts/build-windows.ps1 -Trabajos 1 -ReutilizarReproductor` pasa la opción explícita `--reuse-player` al constructor. Exige un ejecutable Windows `MZ` mayor de 1 MB en `dist-native-player`, registra su SHA256 y lo conserva sin recompilar. La construcción normal sigue recompilando ambos ejecutables. No reutilizarlo si cambian el runtime, el compilador del lector o sus recursos. Para la entrega del 21-10-2026, el reproductor instalado y el exportado comprobados comparten SHA256 `e87f81e36f1b9ff510203afb30b3d2f133509462e840b32b9498160e9e44a10c`.

## Contrato de ejecución

Ejecutar únicamente `voice/python/python.exe -I -B -X utf8 -c <script> --stdin`, con plan JSON por stdin. `plan.runtime` y `plan.models` apuntan respectivamente a `voice/runtime` y `voice/modelos`; la raíz de salida pertenece a la obra. El archivo `python312._pth` solo contiene biblioteca estándar y directorio del intérprete. Se inserta explícitamente la biblioteca privada del plan; no se habilita `site`, Python de PATH ni carpetas de Codex. La salida PCM16 conserva velocidad, normalización, mezcla, pausas, inferencia y fonemización existentes.

Corrección del 21-10-2026 para instalaciones con tildes: el sintetizador resuelve primero las rutas absolutas del plan y fija el directorio actual de su propio proceso a `runtime/espeakng_loader`. El preparador aplica el parche reproducible `scripts/patch-voice-runtime.mjs` a phonemizer 3.4.0: inmediatamente antes de llamar a la biblioteca C, convierte su ruta de datos a relativa solo en Windows. eSpeak recibe `espeak-ng-data`, sin caracteres Unicode en ese argumento; los modelos, la DLL y las grabaciones siguen usando sus rutas Unicode reales. No necesita rutas 8.3 ni copiar recursos fuera de la instalación. El parche exige el SHA256 del archivo original y conserva código fuente, GPL y aviso de modificación.

## Evidencia y límites

`verify-voice-package.mjs` verifica todos los hashes y genera una frase española con PATH reducido a System32, sin variables PYTHONHOME/PYTHONPATH ni Codex. Comprueba WAV no vacío, intérprete/sys.path y versión eSpeak. Guarda evidencia bajo `.cache/native-build/prueba de voz autónoma con tildes/VERIFICACION.txt`. Esta prueba demuestra independencia de herramientas de desarrollo, pero no sustituye la aceptación en una VM Windows limpia y equipo CPU real.

`verify-pcm16.py` es una prueba de desarrollo que compara 113537 muestras deterministas con el escritor anterior libsndfile: formato, duración y error de cuantización máximo de 1 LSB. SoundFile solo se usa para esta comparación en el entorno de desarrollo, no en distribución.

Resultado del 20-10-2026: 113537 muestras, error **0 LSB** frente a libsndfile; paquete de 1472 archivos, aproximadamente **473,7 MiB**, con fuentes GPL y CRT app-local. La frase de control produjo 306668 bytes WAV en 37,5 segundos (equipo de desarrollo con otros trabajos activos; no es una medida de rendimiento garantizada). eSpeak informa 1.52.0. `GetModuleFileNameW` confirmó que MSVCP140, MSVCP140_1, VCRUNTIME140 y VCRUNTIME140_1 se cargaron desde `dist-voice/python`, no desde System32.

Regresión del 21-10-2026: el primer instalador reveló que la ruta Unicode de datos se convertía a UTF-8 antes de un `fopen` de Windows y eSpeak recaía en su ruta de compilación. Con el arreglo se produjeron una frase y otras trece grabaciones reales desde el motor instalado bajo espacios y tildes: 14 WAV mono PCM16 de 24 kHz, todos mayores de un segundo. Registro: `.cache/native-build/regresión voz instalada á con espacios/VERIFICACION-UNICODE.json`. Esta comprobación del motor parcheado precede a la aceptación del nuevo ejecutable que incorpora el script; no sustituye el recorrido completo de Studio ni una VM limpia.

Hashes de modelos: `kokoro-v1.0.onnx`: `beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a`; `voices-v1.0.bin`: `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d`. Inventario completo: `dist-voice/package.json`, revisión `2026-10-21.1` (SHA256 de esta compilación: `f1e27440437eb359c1aeac5452cdbdeb39560dd45c876392ef63a0f7998a9a25`; se regenera cuando cambien recursos).

WebView2 offline descargado desde el enlace oficial Microsoft que usa Tauri, `https://go.microsoft.com/fwlink/?linkid=2124701`. El HEAD del 20-10-2026 resolvió al GUID `35871e19-d11b-432d-9d1e-7be0ff286540`; la caché documentada del empaquetador es `target/.tauri/x64/<GUID>/MicrosoftEdgeWebView2RuntimeInstallerX64.exe`. Archivo de 214156024 bytes, SHA256 `0625fb5c1e75be58a164e14f95aa58a3e5badb859b3d17c952385f3e4a9ff3e8`, firma Authenticode **Valid**, Microsoft Corporation. Este componente firmado no firma ni certifica el instalador propio de Duvarret. Un GUID futuro puede hacer que Tauri descargue otra revisión oficial; conservar la evidencia de la revisión que efectivamente se empaquete.

La GPL de eSpeak/phonemizer y los avisos de NumPy/ONNX se conservan, junto con las fuentes correspondientes. Revisar las condiciones de distribución comercial del conjunto antes de declarar cerrada una auditoría legal. La voz incluida aún requiere evaluación auditiva externa para sostener una promesa pública de calidad en español.

Referencias oficiales: [Python embebido](https://docs.python.org/3.12/using/windows.html#the-embeddable-package), [recursos Tauri](https://v2.tauri.app/develop/resources/), [instalador Windows Tauri](https://v2.tauri.app/distribute/windows-installer/).
