import { describe, expect, it, vi } from 'vitest';
import { MODULE_TYPES, validateManifest } from '../manifest';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { SCENE_CAPABILITIES } from './sceneCapabilities';
import { DirectorOrchestrator } from './orchestrator';
import { interpretInstruction, LocalDirectorProvider, suggestForBeat } from './localDirector';
import type { LlmProvider } from './types';

describe('capacidades disponibles durante una sesión real', () => {
  it('documenta todos los módulos y llega también a proveedores remotos con instrucciones propias', async () => {
    expect(SCENE_CAPABILITIES.map(c => c.type).sort()).toEqual([...MODULE_TYPES].sort());
    const complete = vi.fn<LlmProvider['complete']>().mockResolvedValue({ content: 'Propuesta', toolCalls: [], stopReason: 'stop' });
    await new DirectorOrchestrator({ provider: { kind: 'openai', model: 'prueba', complete }, systemPrompt: 'Instrucciones propias' }).run({ message: 'Sugiere una escena', manifest: validateManifest(sampleManifest()).manifest });
    const system = complete.mock.calls[0]![0].messages[0]!.content;
    expect(system).toContain('Instrucciones propias');
    expect(system).toContain('room_search');
    expect(system).toContain('grant_items');
    expect(system).toContain('expediente');
  });

  it('distingue ganzúa de combinación y habitación de linterna sobre texto', () => {
    const calls = interpretInstruction('Forzar la cerradura con una ganzúa', 'inicio');
    expect(calls.filter(c => c.name === 'mountSimulatedModule').map(c => c.arguments.module_type)).toEqual(['lockpick']);
    expect(interpretInstruction('Una linterna sobre las letras', 'inicio').some(c => c.arguments.effect_type === 'flashlight_mask')).toBe(true);
    const search = interpretInstruction('Buscar con linterna un objeto en el cuarto', 'inicio');
    expect(search.some(c => c.arguments.module_type === 'room_search')).toBe(true);
    expect(search.some(c => c.arguments.effect_type === 'flashlight_mask')).toBe(false);
  });

  it('crea una propuesta de búsqueda con objeto registrado, sin modificar la obra original', async () => {
    const manifest = validateManifest(sampleManifest()).manifest;
    const turn = await new DirectorOrchestrator({ provider: new LocalDirectorProvider() }).run({ message: 'Buscar con linterna «La llave» en el cuarto con assets/images/cuarto.svg', manifest, context: { nodeId: 'inicio' } });
    expect(manifest.item_registry.hallazgo_inicio).toBeUndefined();
    expect(turn.draft.item_registry.hallazgo_inicio?.name).toBe('La llave');
    expect(turn.draft.nodes.find(n => n.node_id === 'inicio')?.gameplay_overlay).toMatchObject({ type: 'room_search', parameters: { image: 'assets/images/cuarto.svg' }, on_success: { grant_items: ['hallazgo_inicio'] } });
    expect(turn.executions.some(e => e.outcome.error)).toBe(false);
  });

  it('sugiere juegos a partir de la prosa y respeta los módulos existentes', () => {
    expect(suggestForBeat('inicio', 'Tomé la ganzúa y forcé la cerradura.').some(s => s.id.endsWith(':lockpick'))).toBe(true);
    expect(suggestForBeat('inicio', 'Busqué con mi linterna hasta encontrar un objeto.').some(s => s.id.endsWith(':room-search'))).toBe(true);
    const node = validateManifest(sampleManifest()).manifest.nodes[0]!;
    node.gameplay_overlay = { type: 'lockpick', title: 'Ganzúa', parameters: {}, is_mandatory_to_advance: true, on_success: { grant_flags: [], revoke_flags: [], grant_items: [], consume_items: [] }, on_failure: { grant_flags: [], revoke_flags: [], grant_items: [], consume_items: [] } };
    expect(suggestForBeat(node.node_id, 'Busqué con mi linterna hasta encontrar un objeto.', { node }).some(s => s.id.endsWith(':room-search'))).toBe(false);
  });
});
