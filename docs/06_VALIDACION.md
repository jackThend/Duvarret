# 06 · Validación en condiciones reales

Mediciones y pruebas del producto compilado, fuera del entorno de pruebas unitarias. Cada apartado indica cómo repetirlo.

## 1. Compilación de escritorio (`npm run build:desktop`)

Compila el reproductor portátil, lo incluye como recurso y empaqueta el Studio.

| Artefacto (Linux x86_64) | Tamaño |
| :--- | ---: |
| Binario del Studio (`duvarret`) | 6,7 MB |
| Reproductor portátil incluido (`duvarret-player`) | 5,3 MB |
| Paquete `.deb` | 6,1 MB |
| Paquete `.rpm` | 6,1 MB |
| AppImage (incluye WebKitGTK y GStreamer) | 79 MB |
| Obra insignia exportada como ejecutable | 5,8 MB |

Todos los ejecutables cumplen el límite de 20 MB. La AppImage es mayor porque lleva dentro el motor web; el `.deb` y el `.rpm` usan el WebKitGTK del sistema. En CI se generan los ejecutables de Windows, macOS y Linux en cada cambio.

## 2. Memoria (RNF-02: el reproductor debe operar con menos de 150 MB)

```bash
npm run medir-ram -- <ejecutable> [--segundos 30] [--solo-medir] [--informe salida.json] [--clic 640,456@6] [--captura ventana.png]
```

El script arranca el ejecutable y suma la memoria de todos sus procesos: el shell de Rust y los del motor web (en macOS, los servicios XPC de WebKit, que no cuelgan del ejecutable). Usa en cada sistema la cifra que muestra su propio monitor:

| Sistema | Métrica principal | Secundaria |
| :--- | :--- | :--- |
| Linux | PSS (reparte las bibliotecas compartidas) | Memoria privada (USS) |
| Windows | Conjunto de trabajo privado (columna «Memoria» del Administrador de tareas) | Conjunto de trabajo |
| macOS | `footprint` (lo que muestra el Monitor de Actividad) | RSS |

En Linux sin pantalla arranca un Xvfb propio; `--clic` y `--captura` solo funcionan allí. Descarta las muestras incompletas (un proceso que se reinicia entre la lista y la lectura) y avisa de cuántas fueron.

**En el CI** se mide en cada cambio, en los tres sistemas, la obra insignia y el mismo shell con una página en blanco (la base del motor web). Las cifras salen en el resumen de la ejecución y en el artefacto `memoria-<sistema>`.

### Resultados (Linux, WebKitGTK 2.x, Xvfb sin GPU, septiembre de 2026)

PSS total del árbol de procesos, régimen estable:

| Caso | Composición GL por software (por defecto aquí) | Sin composición GL (`WEBKIT_DISABLE_DMABUF_RENDERER=1`) |
| :--- | ---: | ---: |
| Página en blanco en el mismo shell de Tauri | 322 MB | 199 MB |
| Página en blanco + `AudioContext` sonando | 352 MB | — |
| Obra insignia, pantalla de título | 384 MB | 226 MB |
| Obra insignia, jugando (Resonance Audio 3D) | 467 MB | 286 MB |
| Obra insignia, jugando (`stereo_simple`) | — | 264 MB |
| Studio, recién abierto | 438 MB | — |

Lo que aporta el propio reproductor sobre la página en blanco: **+27 MB** en el título y **+65–87 MB** jugando, según el motor de audio. En Chromium, el heap de JavaScript de la obra jugando es de 4,6 MB y el DOM tiene 78 nodos: casi todo el aumento está en la parte nativa del motor web (audio, capas de pintado).

### Resultados en el CI (runners de GitHub, pantalla de título, 40 s, septiembre de 2026)

| Sistema | Obra insignia | Página en blanco | Lo que añade la obra |
| :--- | ---: | ---: | ---: |
| Windows (WebView2) · conjunto de trabajo privado | **65,2 MB** | 64,7 MB | +0,5 MB |
| macOS (WKWebView) · `footprint` | **61,5 MB** | 41,5 MB | +20 MB |
| Linux (WebKitGTK) · PSS | **281 MB**¹ | 226 MB | +55 MB |

¹ En los runners de Ubuntu los procesos de WebKitGTK no cuelgan del ejecutable (probablemente por el sandbox `bwrap`) y aparecen a ratos: el script también los busca por nombre y descarta las muestras en que falta alguno (32 de 40 en la obra, 7 de 39 en blanco), así que la cifra de la obra sale de pocas muestras. Sin GPU, la composición GL por software infla la de Linux; en este contenedor, con `WEBKIT_DISABLE_DMABUF_RENDERER=1`, la obra ocupa 203 MB.

En Windows, casi toda la memoria es del proceso principal de WebView2 (30,6 MB); el conjunto de trabajo total, que cuenta varias veces lo compartido con otros programas, ronda los 307 MB y no es la cifra que ve el usuario. En macOS, el proceso de contenido de WebKit pasa de 14 MB (en blanco) a 34 MB con la obra.

### Conclusiones

- **RNF-02 se cumple con holgura en Windows y macOS** en la pantalla de título: unos 60–65 MB, menos de la mitad del límite. Queda medir jugando (con audio 3D), que en Linux añadía 40–60 MB: incluso así seguiría por debajo de 150 MB.
- **En Linux no se cumple:** WebKitGTK con una página vacía ya ronda los 200–225 MB. Ninguna optimización del reproductor puede bajar de esa base. Sin GPU (en este contenedor y en los runners), la composición GL por software añade 120–180 MB; con GPU la cifra real estará más cerca de la columna «sin composición GL».
- **Decisión abierta para el producto:** fijar RNF-02 para Windows y macOS (los destinos del `.exe` y del `.app`) y dar para Linux una cifra orientativa, o expresarlo como «memoria añadida por la obra sobre el motor web», que es lo que Duvarret controla (hoy entre 0,5 y 87 MB según el sistema y el momento).

## 3. Proveedores de IA reales

```bash
npm run duvarret -- probar-ia <obra> --proveedor anthropic|ollama|openai|gemini|local [--modelo m] [--url base] [--escena id]
```

También en el Studio: **⚙ Preferencias → Probar conexión**. Hace una vuelta real del co-director sobre una **copia** de la obra (no la cambia) pidiéndole que sitúe un sonido de prueba a la izquierda del oyente, y comprueba:

1. conexión con el modelo;
2. que use las herramientas del co-director en lugar de escribir JSON;
3. que coloque el sonido donde se pidió (x < 0);
4. que la obra siga siendo válida.

Las claves se leen del entorno (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`). Claude también acepta `ANTHROPIC_AUTH_TOKEN` o un perfil de `ant auth login`.

| Proveedor | Estado |
| :--- | :--- |
| Director local | ✓ supera las cuatro comprobaciones |
| Ollama | Sin probar con un modelo real: el entorno de desarrollo no puede descargar Ollama ni modelos. El error de conexión se detecta y se explica bien. |
| Anthropic Claude | Sin probar con la API real: falta una clave en el entorno. |

Para Ollama se traducen los fallos habituales a un paso concreto: servicio apagado («¿Está abierto? o ejecuta `ollama serve`»), modelo sin descargar («`ollama pull <modelo>`») y modelo sin herramientas («prueba con llama3.1, qwen2.5 o mistral-nemo»).

### Fallo encontrado y corregido

Si un modelo inventaba el identificador de una escena, las herramientas creaban en silencio una escena vacía con ese nombre. Ahora el bus de herramientas rechaza la llamada y devuelve la lista de escenas válidas para que el modelo corrija en el siguiente paso.
