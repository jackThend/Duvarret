# Motor local de narración de Duvarret

El instalador distribuye el intérprete Python embebido oficial, las bibliotecas enumeradas en `../package.json`, Kokoro ONNX v1.0 y el banco de voces v1.0. El motor es un proceso auxiliar, sin llamadas de red. La interpretación Dulce mezcla 75 % de `ef_dora` con 25 % de `af_bella`; no clona voces de personas facilitadas por el usuario.

Las licencias de las bibliotecas se conservan en `../runtime/*dist-info/`, `../runtime/onnxruntime/` y este directorio. No se eliminan metadatos de distribución ni avisos de terceros. NumPy contiene OpenBLAS/LAPACK y GCC Runtime Library Exception; su licencia ampliada está en `runtime/numpy-2.5.4.dist-info/licenses/LICENSE.txt`.

Python 3.12.10: PSF License y licencias de bibliotecas incorporadas, `Python-LICENSE.txt`. Fuente y SBOM: https://www.python.org/ftp/python/3.12.10/ . ZIP oficial SHA256 `4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3`.

Pesos Kokoro: Apache-2.0 según la ficha del fabricante conservada junto a este archivo. Fuente: https://huggingface.co/hexgrad/Kokoro-82M . Conversión ONNX y banco de voces: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 . El paquete registra SHA256 de cada peso.

kokoro-onnx 0.6.1 y espeakng-loader 0.2.4: MIT; sus fuentes Python se distribuyen sin ofuscar. Revisión del cargador correspondiente a 0.2.4: `146599e29be31bf17d99f0bcb7dbb2f92aef3d95`; submódulo eSpeak NG `4870adfa25b1a32b4361592f1be8a40337c58d6c` (informa 1.52.0). Se adjuntan fuentes completas y receta del cargador en archivos `.tar.gz`. Fuentes originales: https://github.com/thewh1teagle/espeakng-loader y https://github.com/espeak-ng/espeak-ng . eSpeak es GPL-3.0-o-posterior: `espeak-ng-COPYING`.

phonemizer 3.4.0: GPL-3.0; todo su código Python legible está en `runtime/phonemizer`, con licencia en `runtime/phonemizer-3.4.0.dist-info/licenses/LICENSE`. Puede modificarse y redistribuirse bajo esa licencia, sin garantía. La receta de reconstrucción de las bibliotecas se conserva con las fuentes; se pueden sustituir en la misma ruta. Duvarret no impide depuración o sustitución de estos componentes.

Modificación Duvarret del 21-10-2026 en `runtime/phonemizer/backend/espeak/api.py`: importa `os` y, solo en Windows, convierte `data_path` mediante `os.path.relpath` antes de codificarla. El sintetizador fija su directorio actual al cargador incluido; así eSpeak recibe `espeak-ng-data`, una ruta ASCII relativa, incluso al instalar bajo carpetas con tildes. Conserva GPL-3.0 y avisos originales. Receta reproducible: `scripts/patch-voice-runtime.mjs`, aplicada por `scripts/prepare-voice.mjs`; exige SHA256 original `e0fb8775e9b1a35d030686954b860f1ec7367d42ea82939df026e67d144d3bf8` y se detiene ante cambios del proveedor. No requiere rutas 8.3 ni copias externas de datos.

No se distribuyen SoundFile, libsndfile ni sus codecs: el WAV PCM16 mono se escribe mediante `wave` de Python. No se instalan paquetes ni descargan pesos al narrar.

Microsoft Visual C++ Runtime 14.44.35112 x64: se incluyen únicamente DLL del directorio oficial redistribuible `Microsoft.VC143.CRT`, app-local junto al intérprete. Condiciones y lista oficial conservadas en `MSVC-Runtime-LICENSE.html` y `MSVC-Redistribution.html`. No se distribuyen DLL de depuración ni compiladores. Fuente oficial: https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/ y https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution . La verificación exige que las DLL MSVCP/VCRUNTIME cargadas pertenezcan al paquete, no System32.
