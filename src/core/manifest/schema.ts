/**
 * Esquema formal del `story_manifest.json` (doc 03).
 *
 * El esquema se construye dos veces a partir de la misma definición:
 *  - **Estricto**: detecta cada desviación (se usa para diagnosticar y generar JSON Schema).
 *  - **Tolerante**: aplica valores seguros por defecto en lugar de abortar (RNF-09).
 */
import { z } from 'zod';
import {
  ACOUSTIC_MATERIALS,
  ACOUSTIC_TRIGGERS,
  AMBIENT_LIGHTING,
  AUDIO_ENGINES,
  AVATAR_POSITIONS,
  ILLUSTRATION_PLACEMENTS,
  LAYOUT_MODES,
  MANIFEST_SCHEMA_URL,
  MODULE_TYPES,
  OVERLAY_TRIGGERS,
  PLAYBACK_MODES,
  ROOM_PRESETS,
  RPG_CHECK_TYPES,
} from './catalog';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function build(tolerant: boolean) {
  // Los ayudantes se tipan siempre con la variante estricta: la tolerante produce la misma salida.
  /** Campo con valor por defecto; en modo tolerante un valor inválido también cae al defecto. */
  const d = <T extends z.ZodType>(schema: T, value: z.output<T>) =>
    (tolerant ? schema.default(value as never).catch(value as never) : schema.default(value as never)) as unknown as z.ZodDefault<T>;
  /** Campo obligatorio; en modo tolerante se sustituye por `fallback`. */
  const r = <T extends z.ZodType>(schema: T, fallback: z.output<T>) =>
    (tolerant ? schema.catch(fallback as never) : schema) as unknown as T;
  /** Campo opcional; en modo tolerante un valor inválido se descarta. */
  const o = <T extends z.ZodType>(schema: T) =>
    (tolerant ? schema.optional().catch(undefined) : schema.optional()) as unknown as z.ZodOptional<T>;
  const obj = <S extends z.ZodRawShape>(shape: S) =>
    (tolerant ? z.object(shape) : z.strictObject(shape)) as unknown as ReturnType<typeof z.strictObject<S>>;
  /** Listas: en modo tolerante se descartan los elementos irrecuperables. */
  const list = <T extends z.ZodType>(item: T) =>
    (tolerant
      ? z
          .array(z.unknown())
          .catch([])
          .transform((values) =>
            values.flatMap((value) => {
              const parsed = item.safeParse(value);
              return parsed.success ? [parsed.data as z.output<T>] : [];
            }),
          )
          .default([])
      : z.array(item).default([])) as unknown as z.ZodDefault<z.ZodArray<T>>;
  const dict = <T extends z.ZodType>(item: T) =>
    (tolerant
      ? z
          .record(z.string(), z.unknown())
          .catch({})
          .transform((entries) => {
            const out: Record<string, z.output<T>> = {};
            for (const [key, value] of Object.entries(entries)) {
              const parsed = item.safeParse(value);
              if (parsed.success) out[key] = parsed.data as z.output<T>;
            }
            return out;
          })
          .default({})
      : z.record(z.string(), item).default({})) as unknown as z.ZodDefault<z.ZodRecord<z.ZodString, T>>;

  const color = (fallback: string) => d(z.string().regex(HEX_COLOR), fallback);
  const flag = z.string().min(1);
  const id = z.string().min(1);
  const assetPath = z.string();

  // ── Bloques de primer nivel ──────────────────────────────────────────────
  const metadata = obj({
    title: d(z.string().min(1), 'Obra sin título'),
    author: d(z.string(), 'Autoría desconocida'),
    version: d(z.string(), '1.0.0'),
    language: d(z.string(), 'es-ES'),
    genre: o(z.string()),
    description: o(z.string()),
    license: o(z.string()),
    created_at: o(z.string()),
    duvarret_runtime_target: d(z.string(), '>=1.0.0'),
  });

  const themePalette = obj({
    background: color('#0d0f12'),
    foreground: color('#e6e8eb'),
    accent: color('#d97706'),
  });

  const globalSettings = obj({
    default_mode: d(z.enum(PLAYBACK_MODES), 'multimedia'),
    allow_screenless_toggle: d(z.boolean(), true),
    audio_engine: d(z.enum(AUDIO_ENGINES), 'resonance_3d'),
    font_family_base: d(z.string().min(1), 'Spectral, serif'),
    theme_palette: d(themePalette, { background: '#0d0f12', foreground: '#e6e8eb', accent: '#d97706' }),
    typewriter_speed_cps: d(z.number().min(5).max(400), 45),
  });

  const voiceProfile = obj({
    tts_pitch: d(z.number().min(0.1).max(2), 1),
    tts_speed: d(z.number().min(0.1).max(3), 1),
    locution_sample: o(assetPath),
  });

  const character = obj({
    name: r(z.string().min(1), 'Personaje sin nombre'),
    color_accent: d(z.string().regex(HEX_COLOR), '#94a3b8'),
    voice_profile: o(voiceProfile),
    sprites: dict(assetPath),
    description: o(z.string()),
  });

  const item = obj({
    name: r(z.string().min(1), 'Objeto sin nombre'),
    description: d(z.string(), ''),
    icon: o(assetPath),
    is_inspectable: d(z.boolean(), false),
    inspect_content: o(z.string()),
  });

  const coordinates = obj({
    x: r(z.number(), 0),
    y: r(z.number(), 0),
    z: r(z.number(), 0),
  });

  const acousticEnvironment = obj({
    default_room_preset: d(z.enum(ROOM_PRESETS), 'small_study'),
    default_material: d(z.enum(ACOUSTIC_MATERIALS), 'wood'),
    master_gain: d(z.number().min(0).max(1), 0.9),
    ambience_bed: o(assetPath),
    listener_orientation_deg: d(z.number().min(-360).max(360), 0),
  });

  const initialState = obj({
    start_node: o(id),
    stats: dict(z.number()),
    flags: list(flag),
    inventory: list(id),
    rng_seed: d(z.number().int(), 1),
  });

  // ── Nodo narrativo ───────────────────────────────────────────────────────
  const typographicEngine = obj({
    layout_mode: d(z.enum(LAYOUT_MODES), 'standard'),
    column_width_rem: o(z.number().min(10).max(80)),
    transition_speed_ms: d(z.number().min(0).max(10000), 1200),
    flicker_effect: d(z.boolean(), false),
    heartbeat_sync: o(
      obj({
        enabled: d(z.boolean(), true),
        bpm: d(z.number().min(20).max(240), 72),
        text_scale_amplitude: d(z.number().min(0).max(0.2), 0.02),
      }),
    ),
    flashlight_reveal: o(
      obj({
        enabled: d(z.boolean(), true),
        radius_px: d(z.number().min(20).max(1200), 180),
        darkness_opacity: d(z.number().min(0).max(1), 0.92),
      }),
    ),
    melt: o(
      obj({
        enabled: d(z.boolean(), true),
        intensity: d(z.number().min(0).max(1), 0.5),
        direction: d(z.enum(['down', 'up']), 'down'),
        duration_ms: d(z.number().min(100).max(60000), 6000),
      }),
    ),
    physics: o(
      obj({
        enabled: d(z.boolean(), true),
        gravity: d(z.number().min(0).max(50), 9.8),
        bounce_factor: d(z.number().min(0).max(1), 0.4),
      }),
    ),
    mirror: o(obj({ axis: d(z.enum(['x', 'y']), 'x') })),
  });

  const acousticEvent = obj({
    event_id: r(id, 'evento_sonoro'),
    asset: r(assetPath, ''),
    label: o(z.string()),
    trigger: d(z.enum(ACOUSTIC_TRIGGERS), 'on_node_enter'),
    trigger_value: o(z.number().min(0).max(100)),
    loop: d(z.boolean(), false),
    coordinates: d(coordinates, { x: 0, y: 0, z: 0 }),
    room_preset: o(z.enum(ROOM_PRESETS)),
    acoustic_material: o(z.enum(ACOUSTIC_MATERIALS)),
    gain: d(z.number().min(0).max(1), 1),
    fade_in_ms: d(z.number().min(0).max(30000), 0),
  });

  const dialogueLine = obj({
    speaker: r(id, 'narrador'),
    mood: d(z.string(), 'neutral'),
    text: r(z.string(), ''),
    position: d(z.enum(AVATAR_POSITIONS), 'left'),
  });

  const visualNovelOverlay = obj({
    enabled: d(z.boolean(), true),
    trigger: d(z.enum(OVERLAY_TRIGGERS), 'on_text_complete'),
    active_speaker: r(id, 'narrador'),
    current_mood: d(z.string(), 'neutral'),
    dialogue_text: d(z.string(), ''),
    avatar_position: d(z.enum(AVATAR_POSITIONS), 'left'),
    lines: list(dialogueLine),
  });

  const outcome = obj({
    grant_flags: list(flag),
    revoke_flags: list(flag),
    grant_items: list(id),
    consume_items: list(id),
    play_sfx: o(assetPath),
    transition_to_node: o(id),
  });

  const gameplayOverlay = obj({
    type: r(z.enum(MODULE_TYPES), 'cipher_lock'),
    is_mandatory_to_advance: d(z.boolean(), false),
    title: d(z.string(), ''),
    parameters: d(z.record(z.string(), z.unknown()), {}),
    on_success: d(outcome, { grant_flags: [], revoke_flags: [], grant_items: [], consume_items: [] }),
    on_failure: d(outcome, { grant_flags: [], revoke_flags: [], grant_items: [], consume_items: [] }),
  });

  const rpgCheck = obj({
    type: d(z.enum(RPG_CHECK_TYPES), 'passive'),
    stat: r(z.string().min(1), 'percepcion'),
    difficulty: d(z.number().min(1).max(30), 10),
    label: o(z.string()),
    on_pass_reveal_extra_text: o(z.string()),
    on_fail_reveal_extra_text: o(z.string()),
    on_pass_grant_flags: list(flag),
    on_fail_grant_flags: list(flag),
  });

  const voicePrompt = obj({
    spoken_prompt: r(z.string(), ''),
    voice_options: list(obj({ phrase: r(z.string().min(1), 'continuar'), target_node: r(id, '') })),
    keypad_shortcuts: dict(id),
  });

  const screenlessMode = obj({
    voice_over_asset: o(assetPath),
    foley_bed: o(assetPath),
    narration_text: o(z.string()),
    voice_prompts: list(voicePrompt),
  });

  const condition = obj({
    required_flag: o(flag),
    forbidden_flag: o(flag),
    required_item: o(id),
    min_stat: o(obj({ stat: r(z.string(), 'percepcion'), value: r(z.number(), 0) })),
  });

  const choice = obj({
    choice_text: r(z.string().min(1), 'Continuar'),
    target_node: r(id, ''),
    condition: o(condition),
    grant_flags: list(flag),
  });

  const navigation = obj({
    default_next_node: o(id),
    choices: list(choice),
    is_ending: d(z.boolean(), false),
  });

  const illustration = obj({
    asset: r(assetPath, ''),
    placement: d(z.enum(ILLUSTRATION_PLACEMENTS), 'header'),
    alt: d(z.string(), ''),
  });

  const glossaryEntry = obj({ term: r(z.string().min(1), 'término'), definition: r(z.string(), '') });

  const node = obj({
    node_id: r(id, ''),
    chapter_id: o(z.string()),
    title: o(z.string()),
    text_payload: d(z.string(), ''),
    illustration: o(illustration),
    ambient_lighting: o(z.enum(AMBIENT_LIGHTING)),
    glossary: list(glossaryEntry),
    grant_flags_on_enter: list(flag),
    grant_items_on_enter: list(id),
    typographic_engine: o(typographicEngine),
    acoustic_events: list(acousticEvent),
    visual_novel_overlay: o(visualNovelOverlay),
    gameplay_overlay: o(gameplayOverlay),
    rpg_checks: list(rpgCheck),
    screenless_mode: o(screenlessMode),
    navigation: d(navigation, { choices: [], is_ending: false }),
  });

  const manifest = obj({
    $schema: d(z.string(), MANIFEST_SCHEMA_URL),
    metadata: tolerant ? d(metadata, metadata.parse({})) : metadata,
    global_settings: d(globalSettings, globalSettings.parse({})),
    character_registry: dict(character),
    item_registry: dict(item),
    acoustic_environment: d(acousticEnvironment, acousticEnvironment.parse({})),
    initial_state: d(initialState, initialState.parse({})),
    nodes: (tolerant ? list(node) : z.array(node)) as z.ZodArray<typeof node>,
  });

  return {
    manifest,
    node,
    typographicEngine,
    acousticEvent,
    visualNovelOverlay,
    gameplayOverlay,
    rpgCheck,
    screenlessMode,
    navigation,
    character,
    item,
    coordinates,
    outcome,
    condition,
    choice,
  };
}

const strict = build(false);
const tolerantBuild = build(true);

export const StoryManifestSchema = strict.manifest;
export const StoryNodeSchema = strict.node;
export const TypographicEngineSchema = strict.typographicEngine;
export const AcousticEventSchema = strict.acousticEvent;
export const VisualNovelOverlaySchema = strict.visualNovelOverlay;
export const GameplayOverlaySchema = strict.gameplayOverlay;
export const RpgCheckSchema = strict.rpgCheck;
export const CharacterSchema = strict.character;
export const ItemSchema = strict.item;

/** Esquemas tolerantes (mismo tipo de salida que los estrictos). */
export const TolerantSchemas = tolerantBuild as unknown as typeof strict;

export type StoryManifest = z.output<typeof StoryManifestSchema>;
export type StoryManifestInput = z.input<typeof StoryManifestSchema>;
export type StoryNode = z.output<typeof StoryNodeSchema>;
export type StoryNodeInput = z.input<typeof StoryNodeSchema>;
export type TypographicEngine = z.output<typeof TypographicEngineSchema>;
export type AcousticEvent = z.output<typeof AcousticEventSchema>;
export type VisualNovelOverlay = z.output<typeof VisualNovelOverlaySchema>;
export type GameplayOverlay = z.output<typeof GameplayOverlaySchema>;
export type RpgCheck = z.output<typeof RpgCheckSchema>;
export type Character = z.output<typeof CharacterSchema>;
export type Item = z.output<typeof ItemSchema>;
export type Coordinates = z.output<typeof strict.coordinates>;
export type Outcome = z.output<typeof strict.outcome>;
export type ChoiceCondition = z.output<typeof strict.condition>;
export type Choice = z.output<typeof strict.choice>;
export type Navigation = z.output<typeof strict.navigation>;
export type ScreenlessMode = z.output<typeof strict.screenlessMode>;
