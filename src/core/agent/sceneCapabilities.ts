/** Conocimiento de puesta en escena incluido en la app, compartido por todos los directores. */
export const SCENE_CAPABILITIES = [
  { type: 'lockpick', title: 'Abrir con ganzúa', when: 'Forzar una cerradura, tacto, sigilo o tensión manual.', parameters: { pin_heights: [1, 3, 2], max_attempts: 5 }, resources: 'No requiere imágenes ni sonidos. Puede exigir un objeto de inventario mediante una elección previa.' },
  { type: 'room_search', title: 'Registrar con linterna', when: 'Explorar un cuarto oscuro y encontrar un objeto.', parameters: { image: 'assets/images/habitacion.svg', item_label: 'Objeto encontrado', item_x: 72, item_y: 64, radius_px: 120 }, resources: 'Necesita una imagen real de la habitación. Registra el objeto con defineInventoryItem y usa on_success.grant_items para recogerlo.' },
  { type: 'fictional_desktop', title: 'Explorar un escritorio', when: 'Leer expedientes, correos y pistas dentro de un ordenador ficticio.', parameters: { os_name: 'ARCHIVO', files: [{ name: 'pista.txt', kind: 'text', content: 'La pista escrita por el autor.' }], goal_file: 'pista.txt' }, resources: 'Los archivos de texto se declaran en parameters; las imágenes deben existir. El expediente permanece legible al resolver.' },
  { type: 'cipher_lock', title: 'Descifrar una combinación', when: 'Resolver una pista numérica o abrir una caja fuerte.', parameters: { target_code: '314', max_attempts: 5 }, resources: 'No requiere assets. El código debe tener una pista accesible en la obra.' },
  { type: 'crt_terminal', title: 'Investigar una terminal', when: 'Teclear órdenes y consultar archivos en una consola retro.', parameters: { boot_lines: ['SISTEMA LISTO.'], files: {} }, resources: 'Declara los archivos y las órdenes admitidas; no ejecuta código real.' },
  { type: 'circuit_wiring', title: 'Conectar un circuito', when: 'Restablecer corriente o emparejar conexiones.', parameters: {}, resources: 'Configura las conexiones según el módulo; no ejecuta código real.' },
] as const;

export const SCENE_DIRECTION_GUIDE = `Capacidades de escena de esta instalación:
${SCENE_CAPABILITIES.map(c => `- ${c.type}: ${c.title}. ${c.when} Ejemplo de config: ${JSON.stringify(c.parameters)}. ${c.resources}`).join('\n')}
Consulta listSceneCapabilities para explorar estas posibilidades y sugiere una cuando sirva al pasaje, sin imponerla ni sustituir un minijuego existente sin petición.
Usa mountSimulatedModule con config declarativa. config admite title, is_mandatory_to_advance, on_success y on_failure; los demás campos son parámetros del módulo.
Para inventario: defineInventoryItem registra id, nombre y descripción; on_success.grant_items concede el objeto registrado. No confundas room_search (habitación ilustrada y recogida) con flashlight_mask (revelar letras).
También puedes proponer novela visual con setVisualNovelSegment, pasillo angosto, derretimiento o caída de letras con setTypographicEffect, y voces o ambientes con requestAssetSynthesis/placeSpatialAudio. Usa at_word para una marca de scroll, delay_ms para retardo y motion para acercar o alejar el sonido.
Aprendizajes de aceptación: aporta assets reales; una ruta reservada no es un archivo generado. No prometas música IA o actuación emocional gratuita. Kokoro genera lectura local y réplicas; los bancos CC0 y recursos importados cubren otras necesidades.
Declara salidas de éxito y fracaso o elecciones desbloqueadas; no envíes al lector a reintentar un puzle ya completado. Para un expediente que se debe leer, concede una bandera y deja continuar después, sin transición instantánea al abrirlo.
Todas las propuestas son borradores sujetos a aprobación del autor; nunca escribas manifiestos ni código a mano.`;
