import { describe, expect, it } from 'vitest';
import example from './__fixtures__/doc03-example.json';
import { StoryManifestSchema, StoryNodeSchema, TolerantSchemas } from './schema';

describe('StoryManifestSchema (estricto)', () => {
  it('valida sin pérdidas el ejemplo exhaustivo del doc 03', () => {
    const parsed = StoryManifestSchema.safeParse(example);
    expect(parsed.success, JSON.stringify(parsed.error?.issues, null, 2)).toBe(true);
    const node = parsed.data!.nodes[0]!;
    expect(node.node_id).toBe('nodo_023_camara_subterranea');
    expect(node.typographic_engine?.layout_mode).toBe('narrow_corridor');
    expect(node.typographic_engine?.column_width_rem).toBe(24);
    expect(node.typographic_engine?.heartbeat_sync?.bpm).toBe(95);
    expect(node.acoustic_events).toHaveLength(2);
    expect(node.acoustic_events[0]?.coordinates).toEqual({ x: 3.5, y: 1.2, z: -4 });
    expect(node.acoustic_events[1]?.trigger_value).toBe(60);
    expect(node.gameplay_overlay?.parameters.target_code).toBe('7391');
    expect(node.gameplay_overlay?.on_success.grant_flags).toEqual(['alarma_desactivada', 'puerta_bunker_abierta']);
    expect(node.screenless_mode?.voice_prompts[0]?.keypad_shortcuts['2']).toBe('nodo_023_rejilla');
    expect(node.navigation.choices[0]?.condition?.required_flag).toBe('alarma_desactivada');
    expect(parsed.data!.character_registry.sancho?.sprites.alarmed).toContain('sancho_alarmed');
    expect(parsed.data!.item_registry.sobre_lacrado?.is_inspectable).toBe(true);
  });

  it('aplica valores por defecto a los bloques opcionales', () => {
    const parsed = StoryManifestSchema.parse({ metadata: { title: 'Breve' }, nodes: [] });
    expect(parsed.global_settings.default_mode).toBe('multimedia');
    expect(parsed.global_settings.audio_engine).toBe('resonance_3d');
    expect(parsed.acoustic_environment.default_room_preset).toBe('small_study');
    expect(parsed.metadata.language).toBe('es-ES');
    expect(parsed.initial_state.rng_seed).toBe(1);
  });

  it('rechaza directivas no contempladas en el catálogo', () => {
    const result = StoryNodeSchema.safeParse({
      node_id: 'n1',
      typographic_engine: { layout_mode: 'spiral_vortex' },
    });
    expect(result.success).toBe(false);
  });

  it('rechaza claves desconocidas en modo estricto', () => {
    const result = StoryNodeSchema.safeParse({ node_id: 'n1', execute_js: 'alert(1)' });
    expect(result.success).toBe(false);
  });

  it('exige las tres coordenadas en modo estricto', () => {
    const result = StoryNodeSchema.safeParse({
      node_id: 'n1',
      acoustic_events: [{ event_id: 'e', asset: 'a.ogg', coordinates: { x: 1, y: 2 } }],
    });
    expect(result.success).toBe(false);
  });
});

describe('TolerantSchemas', () => {
  it('sustituye directivas alucinadas por valores seguros', () => {
    const node = TolerantSchemas.node.parse({
      node_id: 'n1',
      typographic_engine: { layout_mode: 'spiral_vortex', column_width_rem: 9999 },
      acoustic_events: [{ event_id: 'e', asset: 'a.ogg', coordinates: { x: 1, y: 2 }, room_preset: 'mars' }],
      execute_js: 'alert(1)',
    });
    expect(node.typographic_engine?.layout_mode).toBe('standard');
    expect(node.typographic_engine?.column_width_rem).toBeUndefined();
    expect(node.acoustic_events[0]?.coordinates).toEqual({ x: 1, y: 2, z: 0 });
    expect(node.acoustic_events[0]?.room_preset).toBeUndefined();
    expect('execute_js' in node).toBe(false);
  });

  it('descarta elementos de lista irrecuperables', () => {
    const node = TolerantSchemas.node.parse({
      node_id: 'n1',
      acoustic_events: ['basura', 42, { event_id: 'ok', asset: 'x.ogg' }],
    });
    expect(node.acoustic_events).toHaveLength(1);
    expect(node.acoustic_events[0]?.event_id).toBe('ok');
  });
});
