# Limpieza y consolidación del 3 de noviembre de 2026

Registro de mantenimiento; la descripción vigente está en [el documento principal](../../PROYECTO_DUVARRET.md).

Se retiraron 8.488 archivos en once destinos de generación y QA: compilación Rust debug, extracciones y perfil de aceptación, instaladores obsoletos o marcados NO-USAR, resultados temporales y un clon de publicación limpio, sin cambios ni commits locales pendientes. El tamaño lógico retirado fue 9.394.319.605 bytes; no equivale necesariamente a espacio físico liberado porque existían enlaces físicos.

Antes del borrado se verificaron rutas absolutas dentro del proyecto, procesos, instalación registrada y ausencia de enlaces de directorio. Siete huellas SHA256 de archivos protegidos coincidieron antes y después. Se conservaron las obras, sus fuentes y publicaciones, la instalación registrada, los modelos y herramientas de construcción y el instalador entregado. Los detalles locales de rutas y diagnósticos permanecen fuera del repositorio.

La documentación activa se consolidó en un documento principal con copia PDF. Los diseños originales y planes anteriores se archivaron; la nota de preimplementación quedó superada. Las guías especializadas complementan el documento sin redefinir el estado del producto. El PDF original de concepción se conservó sin modificar.

Esta limpieza retiró salidas locales que ya estaban ignoradas por Git. El PR publica la reorganización documental y el código de las bibliotecas; no añade cachés, modelos, instaladores ni archivos personales al repositorio.
