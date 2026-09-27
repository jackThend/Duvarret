# Guías de Eficiencia y Ahorro de Tokens

- **Alcance Quirúrgico:** No inspecciones todo el árbol de archivos sin necesidad. Modifica únicamente los archivos explícitamente solicitados o sus dependencias inmediatas.
- **Selección de Modelos:**
  - Usa **Sonnet** de forma predeterminada para tareas mecánicas: corrección de sintaxis, redacción de tests unitarios, commits, documentación y cambios menores de código.
  - Reserva **Opus** exclusivamente para diseño de arquitectura profunda, refactorizaciones complejas del núcleo o cuando una tarea falle repetidamente y requiera razonamiento avanzado.
- **Gestión de Contexto:** Cuando una tarea o ciclo de PR termine exitosamente, solicita o ejecuta `/compact` para limpiar logs de terminal, outputs de build y residuos de contexto que inflan la lectura de caché.
- **Comandos de Verificación:** Ejecuta únicamente las pruebas específicas de la clase modificada antes de correr suites completas.
