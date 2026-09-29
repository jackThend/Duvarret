# 07 · Publicar una obra

Qué falta para pasar de «exporta y funciona» a «se puede distribuir»: la voz grabada y la firma de los ejecutables.

## 1. Narración grabada (modo sin pantalla)

Sin grabación, el modo sin pantalla lee cada escena con la voz del sistema, que cambia de un equipo a otro y suele sonar mecánica. Con una grabación por escena, la obra suena igual en todas partes.

**En el Studio:** panel izquierdo → **Recursos → Narración grabada**.

1. Elige una escena. A la derecha aparece el texto que hay que leer (la narración específica del modo sin pantalla, si la tiene, o el texto de la escena).
2. Pulsa **● Grabar**, lee con calma y pulsa **■ Detener y guardar**. Los silencios del principio y del final se recortan solos.
3. **▶ Escuchar** para revisarla; **Volver a grabar** la sustituye sin dejar archivos sueltos.
4. **Siguiente escena sin grabar →** salta a la próxima pendiente. Arriba se ve cuántas escenas tienen voz.

También se puede **importar** un archivo grabado con otro programa (WAV, MP3, OGG, FLAC, M4A). Las grabaciones del Studio se guardan en WAV mono de 24 kHz, que todos los motores web reproducen; al exportar, si está `ffmpeg`, se comprimen.

**Cómo suena en la obra:** al entrar en la escena suena el título con la voz del sistema y después la grabación. Los diálogos, hallazgos y opciones esperan a que termine, aunque las teclas funcionan desde el primer momento. **R** repite la grabación, **S** la detiene y **O** lee las opciones. Si falta el archivo, se narra con la voz del sistema.

**Consejos de grabación:** un micrófono de diadema o de solapa a un palmo, una habitación con cortinas o muebles blandos, y el mismo sitio y la misma distancia en todas las sesiones para que el volumen no cambie entre escenas.

## 2. Firma de código

Sin firmar, los ejecutables funcionan, pero:

- **Windows** muestra la pantalla azul de SmartScreen («Windows protegió su PC») y hay que pulsar «Más información → Ejecutar de todas formas».
- **macOS** se niega a abrirlo con doble clic; hay que usar clic derecho → Abrir, o quitar la cuarentena.

`npm run duvarret -- export <obra> --target native` (y `--target portable`) firma el ejecutable si encuentra los certificados en el entorno, y si no, lo dice y sigue.

### Conseguir los certificados

| Sistema | Qué hace falta | Dónde |
| :--- | :--- | :--- |
| Windows | Certificado de firma de código (OV o EV) en formato `.pfx`, o Azure Trusted Signing | Una autoridad de certificación (DigiCert, Sectigo, SSL.com…). Los EV quitan el aviso de SmartScreen desde el primer día; los OV van ganando reputación con las descargas. |
| macOS | Programa de Desarrolladores de Apple, certificado **Developer ID Application** exportado como `.p12`, y una contraseña específica de app para notarizar | developer.apple.com (cuota anual) y appleid.apple.com (contraseñas de app). |

### En el CI (recomendado)

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. El CI los usa en el job «Ejecutable de la obra insignia»; si no existen, publica sin firmar.

| Secreto | Contenido |
| :--- | :--- |
| `WINDOWS_CERTIFICATE` | El `.pfx` en base64 (`base64 -w0 cert.pfx`, o `certutil -encode` en Windows) |
| `WINDOWS_CERTIFICATE_PASSWORD` | Su contraseña |
| `APPLE_CERTIFICATE` | El `.p12` en base64 (`base64 -i cert.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | Su contraseña |
| `APPLE_SIGNING_IDENTITY` | El nombre completo, p. ej. `Developer ID Application: Nombre Apellido (ABCDE12345)` |
| `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_PASSWORD` | Para notarizar: tu Apple ID, el identificador de equipo y la contraseña específica de app |

Los certificados y contraseñas van solo en los secretos del repositorio o en el entorno de tu equipo: nunca en el código ni en un chat.

### En tu equipo

```bash
# Windows (PowerShell): signtool viene con el Windows SDK
$env:DUVARRET_WIN_CERT = "C:\ruta\cert.pfx"; $env:DUVARRET_WIN_CERT_PASSWORD = "…"
npm run duvarret -- export works/mi-obra.duvarret --target native

# macOS: el certificado debe estar en el llavero
export DUVARRET_MAC_IDENTITY="Developer ID Application: Nombre Apellido (ABCDE12345)"
export APPLE_ID=… APPLE_TEAM_ID=… APPLE_PASSWORD=…   # opcional, para notarizar
npm run duvarret -- export works/mi-obra.duvarret --target native
```

Opcional: `DUVARRET_TIMESTAMP_URL` cambia el servidor de sello de tiempo y `DUVARRET_SIGNTOOL` la ruta de `signtool`.

En macOS, el ejecutable exportado es un binario suelto (no un `.app`): Apple lo notariza, pero el sello no se puede «grapar» al archivo, así que Gatekeeper lo comprueba en línea la primera vez que se abre.

### Estado

La firma está preparada y probada con pruebas unitarias (los comandos que se ejecutan), pero **no se ha probado con certificados reales**: el entorno de desarrollo no los tiene. La primera ejecución del CI con los secretos es la prueba de verdad.
