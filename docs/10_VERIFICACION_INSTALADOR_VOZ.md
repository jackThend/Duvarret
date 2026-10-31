# Verificación de la voz incluida en Windows

El guion `scripts/verificar-instalacion-windows.mjs` prepara una obra original mínima mediante `ManifestEditor` y el validador. No utiliza grabaciones de las demos. Genera la primera voz desde Studio, escucha una escena, modifica el texto y comprueba actualización incremental de una frase y después cero frases nuevas. Finalmente exporta una aplicación portátil y reproduce sus grabaciones.

## Ejecución

Desde la raíz del repositorio, con el instalador final ya construido:

```powershell
node scripts/verificar-instalacion-windows.mjs --installer "C:\ruta\Duvarret-setup.exe"
```

La instalación se dirige a una carpeta nueva dentro de `terminados/instalador-hibrido`, con espacios y tildes. Antes de ejecutarla, el guion rechaza cualquier registro de instalación previa de Duvarret para evitar sustituir la aplicación del usuario. No desinstala programas ni borra carpetas. Si ya existe una instalación, debe emplearse un usuario de prueba o una VM; también puede verificarse una extracción previamente preparada con `--app "C:\ruta\duvarret.exe"`, declarando que ese recorrido no demuestra el instalador.

El argumento explícito `--installer` solicita ejecutar la instalación; `--app` solicita únicamente probar el ejecutable indicado. El guion usa `/S` y deja `/D=...` como último argumento, sin comillas internas y sin shell, tal como exige NSIS para una ruta con espacios. Fuentes: [NSIS, línea de comandos](https://nsis.sourceforge.io/Docs/Chapter3.html), [distribución Windows de Tauri y opciones de WebView2](https://v2.tauri.app/distribute/windows-installer/).

## Qué se comprueba y qué no

- Studio y el lector arrancan desde un directorio temporal, con `PATH` limitado a Windows System32 y las variables de motores externos apuntando deliberadamente a ubicaciones inexistentes.
- `PYTHONHOME` y `PYTHONPATH` también son inválidas. Se captura el proceso hijo y se exige que el intérprete pertenezca al directorio instalado y arranque con `-I`.
- Se conserva un testigo de comandos y DLL de los procesos hijos durante la generación, capturas de pantalla y un informe estructurado. Un fallo escribe `status: failed`; no se presenta como éxito.
- El contexto WebView2 permanece offline durante las operaciones y se rechazan peticiones HTTP externas observadas. Esto **no bloquea la red de los procesos nativos**, no cambia el firewall y no demuestra aislamiento de red del sistema operativo.
- La prueba se ejecuta en el equipo de desarrollo. No desinstala su Python ni Codex. Un `PATH` mínimo más la evidencia de procedencia del proceso prueban independencia de los intérpretes externos en ese recorrido, pero no equivalen a una instalación en Windows limpio.
- Al preparar este guion no se encontró `WindowsSandbox.exe` ni procesos VMware/VirtualBox disponibles. La aceptación en VM limpia, sin Python ni Codex y sin conexión del adaptador virtual, sigue siendo una comprobación aparte. La opción de WebView2 elegida por el paquete debe permitir esa instalación sin descargar dependencias.

Los informes y proyectos temporales se conservan para revisión dentro de `terminados/instalador-hibrido/prueba con tilde á-*`. El guion solo termina los procesos que inició; no cierra otras instancias del usuario.
