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
npm run medir-ram -- <ejecutable> [--segundos 30] [--clic 640,456@6] [--captura ventana.png]
```

El script arranca el ejecutable (con un Xvfb propio si no hay pantalla y un `HOME` vacío), suma la memoria de todo el árbol de procesos —el shell de Rust y los procesos de WebKit— y pulsa donde se le indique para medir mientras se juega. Informa la **PSS** (reparte las bibliotecas compartidas entre quienes las usan) y la **memoria privada** (USS). Solo Linux.

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

### Conclusiones

- **RNF-02 no se cumple en Linux con WebKitGTK:** el motor web con una página vacía ya supera los 150 MB. Ninguna optimización del reproductor puede bajar de esa base.
- En este contenedor no hay GPU y la composición GL se hace por software (llvmpipe), lo que añade unos 120–180 MB. En un equipo con GPU esa memoria pasa en gran parte a la tarjeta gráfica, así que la cifra real de un usuario estará más cerca de la columna «sin composición GL».
- **Pendiente:** medir en Windows (WebView2), que es el destino principal del `.exe`, y en macOS (WKWebView). El script mide `/proc` y no sirve allí; hace falta su equivalente (conjunto de trabajo privado en Windows, `footprint` en macOS).
- Decisión abierta para el producto: reformular RNF-02 por plataforma, o como «memoria añadida por la obra sobre el motor web» (hoy 27–87 MB), que es lo que Duvarret controla.

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
