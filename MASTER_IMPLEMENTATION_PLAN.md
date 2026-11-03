# Estado y plan vigente de Duvarret

Referencia: **Studio 0.2.0**, revisada el **3 de noviembre de 2026**.

La descripción del producto y su arquitectura está consolidada en [el documento principal](docs/PROYECTO_DUVARRET.md). Este archivo conserva únicamente el estado y el trabajo pendiente. Las antiguas oleadas y sus registros están en [el plan histórico](docs/archivo/verificaciones/MASTER_IMPLEMENTATION_PLAN_HISTORICO.md).

## Entregado y comprobado

- [x] Editor, runtime, manifiesto validado, importación de texto y proyectos locales.
- [x] Navegación, elecciones, inventario, tipografía, diálogo y módulos interactivos, incluidos ganzúa y búsqueda ilustrada.
- [x] Audio espacial, marcas por scroll con retardo, grabación y narración con identidad de voz.
- [x] Catálogo de capacidades disponible para el co-director y propuestas revisables.
- [x] Formatos Web/PWA, audio-drama interactivo y escritorio seleccionables en ZIP independientes.
- [x] Kokoro y sus dependencias incluidos en el instalador Windows; generación y reproducción verificadas en el ejecutable extraído.
- [x] Mis obras, Mis recursos, perfil opcional, búsqueda, etiquetas, preescucha, deduplicación, papelera y borrado protegido.
- [x] Migración de recientes sin mover obras ni mantener el límite de 20.
- [x] Correcciones de propuestas reactivas y de la última marca visible al agotar scroll.
- [x] Instalador Windows x64 0.2.0 entregado en Escritorio/Instaladores con SHA256.
- [x] Documentación general consolidada y limpieza selectiva de salidas temporales.

La aceptación de 0.2.0 incluyó 20 E2E, 446 casos unitarios entre la suite y su repetición focalizada, tipos/lint y la protección nativa de carpetas. Los informes locales se conservan en `terminados/bibliotecas-0.2.0`. No se presume que ese estado local sea idéntico al de una rama remota; publicar o fusionar cambios es otra operación.

## Próximas verificaciones y ampliaciones

| Prioridad | Trabajo | Criterio de terminación |
| --- | --- | --- |
| Alta | Instalación y actualización en entornos limpios | Crear, narrar, editar, exportar y recuperar una obra sin herramientas del desarrollador. |
| Alta | Recuperación y respaldo | Restauración comprobada ante cierre, fallo de escritura y cambio de equipo; diseño de historial de versiones. |
| Alta | Accesibilidad y dispositivos reales | Recorrer obras con lector de pantalla, teclado y dispositivos móviles, incluidos caminos de fracaso. |
| Media | Generación recuperable | Trabajos persistentes con cancelación, reintento y reanudación claros. |
| Media | Validación de conexiones reales | Ensayos autorizados con los proveedores elegidos y tratamiento de errores de cuota y credenciales. |
| Media | Coordinación de bibliotecas | Evitar pérdidas de catálogo cuando varias instancias escriben al mismo tiempo. |
| Media | Publicación integrada | Subir una obra desde Studio con autorización explícita y verificar su URL y su actualización. |
| Media | Distribución y firma | Certificados, actualizaciones y recuperación comprobados; ampliar aceptación por plataforma. |

Una futura edición gestionada de IA y nuevos generadores de medios necesitan decisiones de producto, costes y privacidad. No forman parte de la promesa actual de trabajo local.

## Regla de continuidad

Leer el documento principal y este estado antes de ampliar una función. Actualizar el contrato, las pruebas y la guía afectada cuando cambie el comportamiento. Los archivos de `docs/archivo` son antecedentes y no nuevas órdenes de implementación.
