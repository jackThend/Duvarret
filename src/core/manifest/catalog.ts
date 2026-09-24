/**
 * Catálogo cerrado de directivas polimórficas del runtime (doc 03 §5).
 *
 * Cada valor técnico tiene una etiqueta en lenguaje literario para la interfaz del Studio,
 * que jamás muestra términos de programación al artista (doc 04 §1).
 */

export const RUNTIME_SCHEMA_VERSION = '1.0.0';
export const MANIFEST_SCHEMA_URL = 'https://duvarret.engine/schemas/v1/story-manifest.json';

export const PLAYBACK_MODES = ['contemplative_book', 'multimedia', 'audio_drama_screenless'] as const;
export const AUDIO_ENGINES = ['resonance_3d', 'steam_audio_wasm', 'stereo_simple'] as const;

export const LAYOUT_MODES = [
  'standard',
  'narrow_corridor',
  'melt_text',
  'heartbeat_tremor',
  'flashlight_mask',
  'physics_fall',
  'mirror_inverted',
] as const;

export const ROOM_PRESETS = [
  'small_study',
  'narrow_concrete_corridor',
  'wooden_cabin',
  'cathedral_echo',
  'outdoor_field',
] as const;

export const ACOUSTIC_MATERIALS = ['wood', 'concrete', 'metal', 'curtains', 'glass', 'stone'] as const;

export const ACOUSTIC_TRIGGERS = [
  'on_node_enter',
  'on_text_reveal_percentage',
  'on_text_complete',
  'on_choice_hover',
  'on_puzzle_solve',
] as const;

export const MODULE_TYPES = ['crt_terminal', 'fictional_desktop', 'cipher_lock', 'circuit_wiring'] as const;

export const AVATAR_POSITIONS = ['left', 'center', 'right'] as const;
export const OVERLAY_TRIGGERS = ['on_node_enter', 'on_text_complete'] as const;
export const ILLUSTRATION_PLACEMENTS = ['fullscreen', 'header', 'margin'] as const;
export const AMBIENT_LIGHTING = ['day', 'dusk', 'night', 'candle'] as const;
export const RPG_CHECK_TYPES = ['passive', 'active'] as const;

export type PlaybackMode = (typeof PLAYBACK_MODES)[number];
export type AudioEngineKind = (typeof AUDIO_ENGINES)[number];
export type LayoutMode = (typeof LAYOUT_MODES)[number];
export type RoomPreset = (typeof ROOM_PRESETS)[number];
export type AcousticMaterial = (typeof ACOUSTIC_MATERIALS)[number];
export type AcousticTrigger = (typeof ACOUSTIC_TRIGGERS)[number];
export type ModuleType = (typeof MODULE_TYPES)[number];

/** Etiquetas para artistas: vocabulario de tono, ritmo, atmósfera y presencia. */
export const LAYOUT_LABELS: Record<LayoutMode, string> = {
  standard: 'Página serena',
  narrow_corridor: 'Pasillo angosto',
  melt_text: 'Texto que se derrite',
  heartbeat_tremor: 'Temblor del pulso',
  flashlight_mask: 'Linterna en la oscuridad',
  physics_fall: 'Palabras que caen',
  mirror_inverted: 'Reflejo de espejo',
};

export const ROOM_LABELS: Record<RoomPreset, string> = {
  small_study: 'Estudio íntimo',
  narrow_concrete_corridor: 'Corredor de hormigón',
  wooden_cabin: 'Cabaña de madera',
  cathedral_echo: 'Eco de catedral',
  outdoor_field: 'Campo abierto',
};

export const MATERIAL_LABELS: Record<AcousticMaterial, string> = {
  wood: 'Madera',
  concrete: 'Hormigón',
  metal: 'Metal',
  curtains: 'Cortinas',
  glass: 'Vidrio',
  stone: 'Piedra',
};

export const TRIGGER_LABELS: Record<AcousticTrigger, string> = {
  on_node_enter: 'Al entrar en la escena',
  on_text_reveal_percentage: 'A mitad de la lectura',
  on_text_complete: 'Al terminar el pasaje',
  on_choice_hover: 'Al dudar entre caminos',
  on_puzzle_solve: 'Al resolver el enigma',
};

export const MODULE_LABELS: Record<ModuleType, string> = {
  crt_terminal: 'Terminal de fósforo',
  fictional_desktop: 'Escritorio antiguo',
  cipher_lock: 'Cerradura de combinación',
  circuit_wiring: 'Cableado de circuitos',
};

export const MODE_LABELS: Record<PlaybackMode, string> = {
  contemplative_book: 'Libro contemplativo',
  multimedia: 'Experiencia multisensorial',
  audio_drama_screenless: 'Audio-drama sin pantalla',
};
