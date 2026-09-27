/**
 * Herramientas nucleares del Agente Director (doc 02 §4.2). Todas se expresan como parches
 * declarativos sobre el manifiesto o consultas al grafo; ninguna ejecuta código.
 */
import { z } from 'zod';
import { ACOUSTIC_MATERIALS, LAYOUT_LABELS, MODULE_LABELS, ROOM_LABELS, ROOM_PRESETS, type RoomPreset } from '../../manifest';
import { describePosition } from '../../../runtime/audio/coordinates';
import { parseSpatialDescription } from '../spatialLanguage';
import { defineTool, type AgentTool } from './registry';

const nodeId = z.string().min(1).describe('Identificador del nodo (escena) del manifiesto');
const looseParams = z.record(z.string(), z.unknown()).default({});

const num = (v: unknown, fallback?: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// ── Cerebro semántico ───────────────────────────────────────────────────────

export const queryLoreGraph = defineTool({
  name: 'queryLoreGraph',
  description: 'Consulta el grafo de lore: devuelve la entidad (por id o nombre) y sus relaciones.',
  schema: z.object({ entity: z.string().min(1), relation_type: z.string().optional() }),
  async run({ entity, relation_type }, ctx) {
    if (!ctx.lore) return { result: [], summary: 'El cerebro de la obra aún está vacío.', mutates: false };
    const results = await ctx.lore.query(entity, relation_type);
    const payload = results.map((r) => ({
      id: r.entity.id,
      category: r.entity.category,
      name: r.entity.name,
      attributes: r.entity.attributes,
      state: undefined as unknown,
      relations: r.relations.map((rel) => ({ with: rel.entity.name, relationship: rel.edge.relationship, weight: rel.edge.weight })),
    }));
    for (const item of payload) item.state = await ctx.lore.stateAt(item.id, ctx.timestamp);
    return { result: payload, summary: `Consulté el lore sobre «${entity}».`, mutates: false };
  },
});

export const updateLoreEntity = defineTool({
  name: 'updateLoreEntity',
  description: 'Actualiza atributos de una entidad del lore (personaje, lugar, objeto…).',
  schema: z.object({ entity_id: z.string().min(1), attributes: z.record(z.string(), z.unknown()) }),
  async run({ entity_id, attributes }, ctx) {
    const ok = (await ctx.lore?.updateEntity(entity_id, { attributes })) ?? false;
    return { result: { ok }, summary: ok ? `Actualicé el lore de «${entity_id}».` : `«${entity_id}» no figura en el lore.`, mutates: false };
  },
});

export const validateContinuity = defineTool({
  name: 'validateContinuity',
  description: 'Comprueba si un acontecimiento propuesto contradice el lore (objetos destruidos, personajes muertos, paraderos).',
  schema: z.object({
    proposed_action: z.string().min(1).describe('Acontecimiento redactado en prosa'),
    target_nodes: z.array(z.string()).default([]),
    actor: z.string().optional(),
  }),
  async run({ proposed_action, actor }, ctx) {
    if (!ctx.supervisor) return { result: { valid: true, issues: [] }, summary: 'Sin lore que contradecir.', mutates: false };
    const issues = await ctx.supervisor.analyzeText(proposed_action, ctx.timestamp ?? Number.MAX_SAFE_INTEGER, actor ? { actor } : {});
    return {
      result: { valid: !issues.some((i) => i.severity === 'error'), issues: issues.map((i) => ({ code: i.code, message: i.message, suggestion: i.suggestion })) },
      summary: issues.length ? issues.map((i) => i.message).join(' ') : 'La continuidad se mantiene.',
      mutates: false,
    };
  },
});

// ── Espectro polimórfico ───────────────────────────────────────────────────

const EFFECTS = ['narrow_corridor', 'melt_text', 'heartbeat_tremor', 'flashlight_mask', 'physics_fall', 'mirror_inverted'] as const;

export const setTypographicEffect = defineTool({
  name: 'setTypographicEffect',
  description: 'Aplica un efecto tipográfico ergódico a una escena (pasillo angosto, licuado, pulso, linterna, caída, espejo).',
  schema: z.object({ node_id: nodeId, effect_type: z.enum(EFFECTS), parameters: looseParams }),
  async run({ node_id, effect_type, parameters: p }, ctx) {
    const engine: Record<string, unknown> = {};
    switch (effect_type) {
      case 'narrow_corridor':
        Object.assign(engine, { layout_mode: 'narrow_corridor', column_width_rem: num(p.column_width_rem, 24), transition_speed_ms: num(p.transition_speed_ms, 1200) });
        break;
      case 'melt_text':
        Object.assign(engine, { layout_mode: 'melt_text', melt: { enabled: true, intensity: num(p.intensity, 0.5), direction: p.direction === 'up' ? 'up' : 'down', duration_ms: num(p.duration_ms, 6000) } });
        break;
      case 'heartbeat_tremor':
        engine.heartbeat_sync = { enabled: true, bpm: num(p.bpm, 96), text_scale_amplitude: num(p.amplitude ?? p.text_scale_amplitude, 0.02) };
        break;
      case 'flashlight_mask':
        engine.flashlight_reveal = { enabled: true, radius_px: num(p.radius_px, 180), darkness_opacity: num(p.darkness_opacity, 0.92) };
        break;
      case 'physics_fall':
        Object.assign(engine, { layout_mode: 'physics_fall', physics: { enabled: true, gravity: num(p.gravity, 9.8), bounce_factor: num(p.bounce_factor, 0.4) } });
        break;
      case 'mirror_inverted':
        Object.assign(engine, { layout_mode: 'mirror_inverted', mirror: { axis: p.axis === 'y' ? 'y' : 'x' } });
        break;
    }
    if (typeof p.flicker_effect === 'boolean') engine.flicker_effect = p.flicker_effect;
    const patch = ctx.editor.patchNode(node_id, { typographic_engine: engine });
    return { result: { ok: true, issues: patch.issues.length }, summary: `${LAYOUT_LABELS[effect_type]} en «${node_id}».`, mutates: true, issues: patch.issues, nodeId: node_id };
  },
});

export const setVisualNovelSegment = defineTool({
  name: 'setVisualNovelSegment',
  description: 'Convierte un pasaje dialógico en una escena de novela visual con retratos y estados de ánimo.',
  schema: z.object({
    node_id: nodeId,
    speakers: z.array(z.object({ character_id: z.string().min(1), mood: z.string().default('neutral'), sprite_url: z.string().optional(), name: z.string().optional() })).default([]),
    dialogue_tree: z.array(z.object({ speaker: z.string().min(1), text: z.string().min(1), mood: z.string().optional() })).min(1),
    trigger: z.enum(['on_node_enter', 'on_text_complete']).default('on_text_complete'),
  }),
  async run({ node_id, speakers, dialogue_tree, trigger }, ctx) {
    const registry: Record<string, unknown> = {};
    const known = ctx.editor.current.character_registry;
    for (const s of speakers) {
      const existing = known[s.character_id];
      registry[s.character_id] = {
        name: existing?.name ?? s.name ?? s.character_id,
        ...(s.sprite_url ? { sprites: { ...(existing?.sprites ?? {}), [s.mood]: s.sprite_url } } : {}),
      };
    }
    for (const line of dialogue_tree) {
      if (!known[line.speaker] && !registry[line.speaker]) registry[line.speaker] = { name: line.speaker };
    }
    const manifestIssues = Object.keys(registry).length ? ctx.editor.patchManifest({ character_registry: registry }) : [];
    const moodOf = (speaker: string) => speakers.find((s) => s.character_id === speaker)?.mood ?? 'neutral';
    const lines = dialogue_tree.map((l, i) => ({ speaker: l.speaker, mood: l.mood ?? moodOf(l.speaker), text: l.text, position: i % 2 === 0 ? 'left' : 'right' }));
    const first = lines[0]!;
    const patch = ctx.editor.patchNode(node_id, {
      visual_novel_overlay: { enabled: true, trigger, active_speaker: first.speaker, current_mood: first.mood, dialogue_text: first.text, avatar_position: 'left', lines },
    });
    return {
      result: { ok: true, lines: lines.length },
      summary: `Diálogo escenificado con ${new Set(lines.map((l) => l.speaker)).size} voces en «${node_id}».`,
      mutates: true,
      issues: [...manifestIssues, ...patch.issues],
      nodeId: node_id,
    };
  },
});

const MODULE_ALIASES = { crt_terminal: 'crt_terminal', fictional_desktop: 'fictional_desktop', circuit_puzzle: 'circuit_wiring', circuit_wiring: 'circuit_wiring', cipher_lock: 'cipher_lock' } as const;

export const mountSimulatedModule = defineTool({
  name: 'mountSimulatedModule',
  description: 'Monta un minijuego aislado en una escena (terminal retro, escritorio simulado, puzle de circuitos, cerradura de combinación).',
  schema: z.object({
    node_id: nodeId,
    module_type: z.enum(['crt_terminal', 'fictional_desktop', 'circuit_puzzle', 'circuit_wiring', 'cipher_lock']),
    config: looseParams,
  }),
  async run({ node_id, module_type, config }, ctx) {
    const type = MODULE_ALIASES[module_type];
    const { title, is_mandatory_to_advance, on_success, on_failure, ...parameters } = config;
    const patch = ctx.editor.patchNode(node_id, {
      gameplay_overlay: {
        type,
        title: typeof title === 'string' ? title : MODULE_LABELS[type],
        is_mandatory_to_advance: typeof is_mandatory_to_advance === 'boolean' ? is_mandatory_to_advance : true,
        parameters,
        ...(on_success && typeof on_success === 'object' ? { on_success } : {}),
        ...(on_failure && typeof on_failure === 'object' ? { on_failure } : {}),
      },
    });
    return { result: { ok: true, type }, summary: `${MODULE_LABELS[type]} en «${node_id}».`, mutates: true, issues: patch.issues, nodeId: node_id };
  },
});

// ── Audio espacial ─────────────────────────────────────────────────────────

/** Presets de la arquitectura (doc 02) → presets del manifiesto (doc 03). */
const ROOM_ALIASES: Record<string, RoomPreset> = {
  small_room: 'small_study',
  narrow_corridor: 'narrow_concrete_corridor',
  cave: 'cathedral_echo',
  large_vault: 'cathedral_echo',
  outdoor: 'outdoor_field',
  ...Object.fromEntries(ROOM_PRESETS.map((r) => [r, r])),
};

const TRIGGER_ALIASES = {
  on_enter: 'on_node_enter',
  on_node_enter: 'on_node_enter',
  on_text_reveal: 'on_text_reveal_percentage',
  on_text_reveal_percentage: 'on_text_reveal_percentage',
  on_text_complete: 'on_text_complete',
  on_interaction: 'on_choice_hover',
  on_choice_hover: 'on_choice_hover',
  on_puzzle_solve: 'on_puzzle_solve',
} as const;

export const placeSpatialAudio = defineTool({
  name: 'placeSpatialAudio',
  description:
    'Coloca un sonido en el espacio 3D alrededor del oyente (metros: x derecha+, y arriba+, z delante+). Puede recibir coordenadas o una descripción en lenguaje natural.',
  schema: z.object({
    node_id: nodeId,
    asset_path: z.string().min(1),
    coordinates: z.object({ x: z.number(), y: z.number().default(0), z: z.number().default(0) }).optional(),
    position_description: z.string().optional().describe('p. ej. «a la derecha a 3 metros»'),
    room_preset: z.string().default('small_room'),
    acoustic_material: z.enum(ACOUSTIC_MATERIALS).default('stone'),
    trigger_event: z.enum(Object.keys(TRIGGER_ALIASES) as [keyof typeof TRIGGER_ALIASES, ...(keyof typeof TRIGGER_ALIASES)[]]).default('on_enter'),
    trigger_value: z.number().min(0).max(100).optional(),
    loop: z.boolean().default(false),
    gain: z.number().min(0).max(1).default(0.8),
    label: z.string().optional(),
    event_id: z.string().optional(),
  }),
  async run(args, ctx) {
    const reading = args.position_description ? parseSpatialDescription(args.position_description) : null;
    const coordinates = args.coordinates ?? reading?.coordinates ?? { x: 0, y: 0, z: 1 };
    const room = ROOM_ALIASES[args.room_preset] ?? 'small_study';
    const trigger = TRIGGER_ALIASES[args.trigger_event];
    const base = args.event_id ?? args.label ?? args.asset_path.split('/').pop()!.replace(/\.[^.]+$/, '');
    const eventId = base
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_');
    const existing = ctx.editor.node(args.node_id)?.acoustic_events ?? [];
    const event = {
      event_id: eventId,
      asset: args.asset_path,
      label: args.label ?? eventId.replace(/_/g, ' '),
      trigger,
      ...(trigger === 'on_text_reveal_percentage' ? { trigger_value: args.trigger_value ?? 50 } : {}),
      loop: args.loop,
      coordinates,
      room_preset: room,
      acoustic_material: args.acoustic_material,
      gain: args.gain,
    };
    const events = [...existing.filter((e) => e.event_id !== eventId), event];
    const patch = ctx.editor.patchNode(args.node_id, { acoustic_events: events });
    if (ctx.assets && !ctx.assets.get(args.asset_path)) ctx.assets.register({ path: args.asset_path, origin: 'author', status: 'missing' });
    return {
      result: { ok: true, event_id: eventId, coordinates, room_preset: room },
      summary: `«${event.label}» ${describePosition(coordinates)}, con el eco de ${ROOM_LABELS[room].toLowerCase()}.`,
      mutates: true,
      issues: patch.issues,
      nodeId: args.node_id,
    };
  },
});

// ── Assets híbridos ────────────────────────────────────────────────────────

export const requestAssetSynthesis = defineTool({
  name: 'requestAssetSynthesis',
  description: 'Solicita la creación sintética de un recurso (retrato, fondo, efecto de sonido o voz) respetando el estilo de la obra.',
  schema: z.object({ type: z.enum(['portrait', 'background', 'sfx', 'voice']), prompt: z.string().min(3), style_preset: z.string().default('editorial') }),
  async run(request, ctx) {
    if (!ctx.synthesizer) return { result: { error: 'No hay generador configurado.' }, summary: 'No hay un generador de recursos configurado.', mutates: false };
    const result = await ctx.synthesizer.synthesize(request);
    ctx.assets?.register({ path: result.path, origin: 'synthetic', status: result.status, provider: result.provider, prompt: request.prompt, style_preset: request.style_preset });
    return {
      result,
      summary: result.status === 'ready' ? `Creé «${result.path}».` : `Reservé «${result.path}»; queda pendiente de crearse o de que aportes el tuyo.`,
      mutates: false,
    };
  },
});

export const DIRECTOR_TOOLS: AgentTool[] = [
  queryLoreGraph,
  updateLoreEntity,
  validateContinuity,
  setTypographicEffect,
  setVisualNovelSegment,
  mountSimulatedModule,
  placeSpatialAudio,
  requestAssetSynthesis,
] as unknown as AgentTool[];
