# Documentación de Duvarret

## Documento principal

**[Duvarret: qué es, para qué sirve y cómo funciona](PROYECTO_DUVARRET.md)** es la referencia vigente para entender el producto. Su [PDF](PROYECTO_DUVARRET.pdf) reproduce el mismo contenido para leer o compartir. Incluye el recorrido de autoría, ejemplos, bibliotecas, voz, IA, publicación, datos, arquitectura y límites de Studio 0.2.0.

No hay varios PRD actuales que deban interpretarse a la vez: las descripciones generales anteriores se consolidaron en ese documento.

## Guías que lo complementan

| Documento | Pregunta que resuelve |
| --- | --- |
| [Validación](06_VALIDACION.md) | ¿Qué comprobar y cómo distinguir evidencia histórica de una prueba nueva? |
| [Publicación](07_PUBLICACION.md) | ¿Qué entrega cada formato y cómo se comparte? |
| [Motor de voz](10_MOTOR_VOZ_INCLUIDO.md) | ¿Cómo se prepara, empaqueta y ejecuta Kokoro en Windows? |
| [Verificación del instalador](10_VERIFICACION_INSTALADOR_VOZ.md) | ¿Cómo ensayar el ejecutable y la voz sin confundirlo con una VM limpia? |
| [Plan vigente](../MASTER_IMPLEMENTATION_PLAN.md) | ¿Qué está entregado y qué queda por validar o desarrollar? |

## Contratos y antecedentes

El contrato técnico ejecutable está en `src/core/manifest/schema.ts`, `src/core/manifest/catalog.ts` y `schemas/story-manifest.schema.json`. La documentación de diseño inicial no sustituye esos archivos.

En [archivo](archivo/README.md) se conservan la concepción original, los primeros requisitos y los planes e informes de etapas anteriores, identificados como históricos. La nota antigua que afirmaba que el proyecto todavía no tenía código se retiró por estar superada. Las notas de capacidades y bibliotecas quedaron integradas en el documento principal.

La limpieza del 3 de noviembre de 2026 retiró archivos regenerables y duplicados de pruebas; las obras, las fuentes de voz y la instalación registrada se conservaron. El registro local está en `.cache/limpieza-2026-11-03/` y la memoria de continuidad en `.cache/continuidad/`.

## Mantener la copia PDF

La fuente editorial es `PROYECTO_DUVARRET.md`. La copia PDF se genera con `python scripts/generate-project-pdf.py` desde la raíz. El script necesita ReportLab y fuentes Arial/Consolas o DejaVu; registra la huella SHA256 de la fuente en los metadatos del PDF. Después de regenerarlo se comprueban el índice, los marcadores y las páginas renderizadas. No editar el PDF como un documento independiente.
