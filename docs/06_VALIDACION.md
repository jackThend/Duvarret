# Validar Duvarret y una obra

Referencia vigente: [documento principal](PROYECTO_DUVARRET.md), Studio 0.2.0. Las medidas y resultados antiguos se conservan en [el informe histórico](archivo/verificaciones/06_VALIDACION_ANTERIOR.md); no son una certificación de cada compilación nueva.

## Cambios de código

Ejecutar las pruebas pertinentes a la función modificada, tipos y lint. Para cambios amplios, comprobar las suites y el runtime afectado:

```text
npm run typecheck
npm run lint
npx vitest run --maxWorkers=2
npx playwright test --workers=2
```

En `src-tauri`, `cargo test` comprueba la parte nativa. El número de trabajadores limitado evita saturar equipos de desarrollo. No es necesario reconstruir Windows por editar solo Markdown.

## Recorrido de autoría

1. Crear una obra, editar, esperar autoguardado y volver a abrir.
2. Cambiar de obra con cambios pendientes y comprobar que se conservan.
3. Importar un recurso, verificar sus bytes y preescucharlo o visualizarlo.
4. Guardarlo en Mis recursos, buscarlo, etiquetarlo y reutilizarlo en otro proyecto.
5. Enviar a papelera, restaurar y borrar la copia personal; la otra obra debe mantener su recurso.
6. Confirmar que el proyecto abierto y los recursos en uso están protegidos, y que no se borran carpetas externas por el comando de obras personales.

## Recorrido del lector

Recorrer cada final y las condiciones de inventario. Resolver y fallar acertijos, abandonar búsquedas y comprobar que hay continuación. Verificar marcas por desplazamiento, retardo, silencio, fuentes en movimiento, cambios de escena y voces pendientes. Ensayar la adaptación sin pantalla y los controles de teclado.

Los recursos ausentes y los errores de integridad deben comunicarse. Una exportación permitida como borrador no pasa a ser una publicación completa por existir un ZIP.

## Voz y distribución

Seguir [la aceptación del instalador](10_VERIFICACION_INSTALADOR_VOZ.md). Probar sobre la instalación o extracción declarada, con WAV nuevos y reproducción real. Diferenciar la prueba del panel de narración (HTMLAudio) de la salida Web Audio del reproductor. Verificar regeneración incremental y caché.

La entrega 0.2.0 comprobó 20 E2E y 446 casos unitarios entre la ejecución general y la repetición focalizada. El ejecutable extraído generó y reprodujo Kokoro y copió la voz a la biblioteca. Sus 1.472 archivos de voz se cotejaron con los hashes del paquete. Los informes locales están en `terminados/bibliotecas-0.2.0`; las extracciones y los perfiles temporales pueden retirarse después de conservar esa evidencia.

Estos resultados no sustituyen un ensayo en VM limpia ni una prueba con cuentas reales de todos los proveedores. La infraestructura de conexión se puede probar con respuestas simuladas, pero la disponibilidad del servicio requiere una comprobación autorizada aparte.

## Rendimiento y accesibilidad

El consumo debe medirse en una compilación concreta, con su sistema, escenas, audio y procesos del motor web. Las metas históricas de memoria y tamaño no se deben presentar como medidas universales del instalador con voz incluida.

La prueba de escucha 3D sirve para evaluar localización con auriculares y el motor del equipo. Para accesibilidad se necesitan recorridos con las tecnologías de apoyo y dispositivos reales, además de pruebas automatizadas.
