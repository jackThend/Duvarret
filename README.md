# Duvarret

Duvarret es un estudio de autoría para crear relatos interactivos a partir de texto: decisiones, ilustraciones, voces, ambientes, tipografía expresiva y pequeñas escenas jugables. Publica la misma obra como Web/PWA, audio-drama interactivo o lector de escritorio.

**Versión de referencia local: Studio 0.2.0.** Incluye Mis obras, Mis recursos, perfil local opcional, autoguardado y voz Kokoro en la distribución Windows. El autor puede trabajar sin un proveedor de IA de pago; las conexiones externas son opcionales.

## Entender el proyecto

- **[Documento principal del proyecto](docs/PROYECTO_DUVARRET.md):** propósito, personas destinatarias, posibilidades narrativas, guía de uso, bibliotecas, IA, formatos, datos, arquitectura, pruebas y límites actuales.
- **[Documento en PDF](docs/PROYECTO_DUVARRET.pdf):** copia de lectura y consulta del mismo contenido.
- [Mapa de documentación](docs/README.md).
- [Estado y plan vigente](MASTER_IMPLEMENTATION_PLAN.md).

## Desarrollar

Entorno local comprobado: Node.js 24. La CI declara su versión de Node en `.github/workflows/ci.yml`.

```text
npm ci
npm run dev
```

Studio abre en `http://localhost:1420`. `?obra=bienvenida` muestra una obra mínima. Para ejecutar el escritorio se necesita Rust y las dependencias nativas de Tauri de la plataforma; después se utiliza `npm run tauri dev`.

```text
npm run typecheck
npm run lint
npx vitest run --maxWorkers=2
npx playwright test --workers=2
npm run build
```

Las pruebas Rust se ejecutan con `cargo test` dentro de `src-tauri`. La construcción del instalador es `npm run build:desktop`; requiere preparar la voz incluida según [su guía](docs/10_MOTOR_VOZ_INCLUIDO.md). En Windows, `scripts/build-windows.ps1` configura el toolchain portátil si está preparado en este equipo.

## Mapa del código

| Carpeta | Contenido |
| --- | --- |
| `src/core/` | Manifiesto, herramientas del agente, importación, lore, recursos y compilador. |
| `src/runtime/` | Reproductor, navegación, inventario, tipografía, módulos y audio. |
| `src/studio/` | Editor, paneles, bibliotecas, stores y servicios. |
| `src/player/` | Entrada del reproductor independiente. |
| `src-tauri/` | Shell Rust, disco, credenciales, voz y configuración Tauri. |
| `scripts/` | Construcción, CLI, preparación y verificaciones. |
| `works/` | Proyectos de ejemplo editables. |
| `e2e/` | Recorridos automatizados en navegador. |

Para validar una obra: `npm run duvarret -- validate <carpeta.duvarret>`. Para Web: `npm run duvarret -- export <carpeta.duvarret> --target web --zip`. La aplicación permite elegir formatos y obtener ZIP independientes; [publicación](docs/07_PUBLICACION.md) explica cómo compartirlos.

## Trabajar con agentes

Las instrucciones vigentes están en [AGENTS.md](AGENTS.md). El esquema ejecutable y las pruebas prevalecen sobre las propuestas históricas. Los diseños originales se conservan identificados en [docs/archivo](docs/archivo/README.md).
