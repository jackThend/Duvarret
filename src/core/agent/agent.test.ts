import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateManifest, type StoryManifest } from '../manifest';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { createSqlJsDriver, LoreGraph, ContinuitySupervisor } from '../lore';
import { AssetRegistry, OfflineSynthesizer } from '../assets/registry';
import {
  AnthropicProvider,
  DirectorOrchestrator,
  GeminiProvider,
  LocalDirectorProvider,
  ManifestEditor,
  OllamaProvider,
  OpenAiProvider,
  ToolRegistry,
  DIRECTOR_TOOLS,
  createProvider,
  interpretInstruction,
  suggestForBeat,
  type CompletionRequest,
  type CompletionResponse,
  type LlmProvider,
} from './index';
import { toGeminiSchema } from './providers/gemini';

const manifest = (): StoryManifest => validateManifest(sampleManifest()).manifest;

function jsonFetch(body: unknown, capture: { url?: string; init?: RequestInit }[] = []) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    capture.push({ url, ...(init ? { init } : {}) });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

const request = (): CompletionRequest => ({
  messages: [
    { role: 'system', content: 'Eres el director.' },
    { role: 'user', content: 'Pon una gotera a la derecha' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'placeSpatialAudio', arguments: { node_id: 'inicio' } }] },
    { role: 'tool', toolCallId: 'c1', name: 'placeSpatialAudio', content: '{"ok":true}' },
    { role: 'tool', toolCallId: 'c2', name: 'queryLoreGraph', content: '[]' },
  ],
  tools: [{ name: 'placeSpatialAudio', description: 'x', parameters: { type: 'object', properties: { node_id: { type: 'string', default: 'a' } }, additionalProperties: false } }],
  context: { nodeId: 'inicio', nodeText: 'El pasillo.' },
});

describe('proveedores (tool calling estándar)', () => {
  it('OpenAI: traduce herramientas y llamadas', async () => {
    const calls: { url?: string; init?: RequestInit }[] = [];
    const provider = new OpenAiProvider({
      kind: 'openai',
      apiKey: 'sk-test',
      fetch: jsonFetch(
        { model: 'gpt-4o', choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'setTypographicEffect', arguments: '{"node_id":"inicio"}' } }] } }] },
        calls,
      ),
    });
    const res = await provider.complete(request());
    expect(res.stopReason).toBe('tool_calls');
    expect(res.toolCalls[0]).toEqual({ id: 't1', name: 'setTypographicEffect', arguments: { node_id: 'inicio' } });
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    expect(body.tools[0].type).toBe('function');
    expect(body.messages[0].content).toContain('Escena actual: inicio');
    expect(body.messages[2].tool_calls[0].function.arguments).toBe('{"node_id":"inicio"}');
    expect(body.messages.filter((m: { role: string }) => m.role === 'tool')).toHaveLength(2);
  });

  it('Ollama: modelos locales sin conexión', async () => {
    const calls: { url?: string; init?: RequestInit }[] = [];
    const provider = new OllamaProvider({
      kind: 'ollama',
      fetch: jsonFetch({ model: 'llama3.1', message: { content: '', tool_calls: [{ function: { name: 'queryLoreGraph', arguments: { entity: 'Sancho' } } }] } }, calls),
    });
    const res = await provider.complete(request());
    expect(calls[0]!.url).toBe('http://localhost:11434/api/chat');
    expect(res.toolCalls[0]?.arguments).toEqual({ entity: 'Sancho' });
    expect(JSON.parse(String(calls[0]!.init!.body)).stream).toBe(false);
  });

  it('Gemini: declaraciones de funciones y respuestas', async () => {
    const calls: { url?: string; init?: RequestInit }[] = [];
    const provider = new GeminiProvider({
      kind: 'gemini',
      apiKey: 'g-key',
      fetch: jsonFetch({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Hecho.' }] } }] }, calls),
    });
    const res = await provider.complete(request());
    expect(res).toMatchObject({ content: 'Hecho.', stopReason: 'stop' });
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(calls[0]!.url).toContain('models/gemini-2.5-pro:generateContent');
    expect(body.systemInstruction.parts[0].text).toContain('Eres el director.');
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.contents[2].parts).toHaveLength(2); // dos respuestas de función agrupadas
    expect(body.tools[0].functionDeclarations[0].parameters.additionalProperties).toBeUndefined();
    expect(toGeminiSchema({ type: 'object', default: 1, properties: { a: { type: 'string', default: 'x' } } })).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
  });

  it('Gemini: bloqueos de seguridad se tratan como negativa', async () => {
    const provider = new GeminiProvider({ kind: 'gemini', fetch: jsonFetch({ promptFeedback: { blockReason: 'SAFETY' } }) });
    expect((await provider.complete(request())).stopReason).toBe('refusal');
  });

  it('Claude: SDK oficial, reenvío de bloques y agrupación de resultados', async () => {
    const calls: { url?: string; init?: RequestInit }[] = [];
    const provider = new AnthropicProvider({
      kind: 'anthropic',
      apiKey: 'sk-ant-test',
      fetch: jsonFetch(
        {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5',
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [
            { type: 'thinking', thinking: '', signature: 'sig' },
            { type: 'text', text: 'Coloco la gotera.' },
            { type: 'tool_use', id: 'toolu_1', name: 'placeSpatialAudio', input: { node_id: 'inicio', asset_path: 'a.ogg' } },
          ],
        },
        calls,
      ),
    });
    const res = await provider.complete(request());
    expect(res.stopReason).toBe('tool_calls');
    expect(res.content).toBe('Coloco la gotera.');
    expect(res.toolCalls).toEqual([{ id: 'toolu_1', name: 'placeSpatialAudio', arguments: { node_id: 'inicio', asset_path: 'a.ogg' } }]);
    expect(Array.isArray(res.providerContent)).toBe(true);
    const url = String(calls[0]!.url);
    expect(url).toContain('/v1/messages');
    const headers = new Headers(calls[0]!.init!.headers as HeadersInit);
    expect(headers.get('x-api-key')).toBe('sk-ant-test');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.model).toBe('claude-opus-5');
    expect(body.fallbacks).toBe('default');
    expect(body.system).toContain('Escena actual: inicio');
    expect(body.tools[0].input_schema.type).toBe('object');
    // los dos resultados de herramienta viajan en un único mensaje de usuario
    expect(body.messages.at(-1).role).toBe('user');
    expect(body.messages.at(-1).content.map((b: { type: string }) => b.type)).toEqual(['tool_result', 'tool_result']);
  });

  it('Claude: una negativa no ejecuta herramientas', async () => {
    const provider = new AnthropicProvider({
      kind: 'anthropic',
      apiKey: 'k',
      fetch: jsonFetch({
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        stop_reason: 'refusal',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }],
      }),
    });
    const res = await provider.complete(request());
    expect(res.stopReason).toBe('refusal');
    expect(res.toolCalls).toEqual([]);
  });

  it('errores de red y de estado se traducen a mensajes para el autor', async () => {
    const provider = new OpenAiProvider({ kind: 'openai', fetch: vi.fn(async () => new Response('limite', { status: 429 })) });
    await expect(provider.complete(request())).rejects.toThrow('(429)');
  });

  it('la fábrica crea cada conector', () => {
    expect(createProvider({ kind: 'anthropic', apiKey: 'k' }).model).toBe('claude-opus-5');
    expect(createProvider({ kind: 'local' }).kind).toBe('local');
    expect(createProvider({ kind: 'ollama', model: 'mistral' }).model).toBe('mistral');
  });
});

describe('herramientas del director', () => {
  let editor: ManifestEditor;
  const registry = new ToolRegistry(DIRECTOR_TOOLS);
  beforeEach(() => {
    editor = new ManifestEditor(manifest());
  });

  it('expone esquemas JSON estándar para las 8 herramientas nucleares', () => {
    const specs = registry.specs();
    expect(specs.map((s) => s.name).sort()).toEqual(
      ['mountSimulatedModule', 'placeSpatialAudio', 'queryLoreGraph', 'requestAssetSynthesis', 'setTypographicEffect', 'setVisualNovelSegment', 'updateLoreEntity', 'validateContinuity'].sort(),
    );
    for (const spec of specs) expect(spec.parameters.type).toBe('object');
  });

  it('setTypographicEffect traduce directivas al manifiesto', async () => {
    await registry.execute('setTypographicEffect', { node_id: 'rejilla', effect_type: 'melt_text', parameters: { intensity: 0.7 } }, { editor });
    expect(editor.node('rejilla')?.typographic_engine).toMatchObject({ layout_mode: 'melt_text', melt: { intensity: 0.7 } });
  });

  it('placeSpatialAudio entiende lenguaje natural y registra la procedencia', async () => {
    const assets = new AssetRegistry();
    const out = await registry.execute(
      'placeSpatialAudio',
      { node_id: 'rejilla', asset_path: 'assets/audio/sfx/phone.ogg', position_description: 'el teléfono suena a la derecha a 3 metros', room_preset: 'narrow_corridor', trigger_event: 'on_text_reveal' },
      { editor, assets },
    );
    const event = editor.node('rejilla')!.acoustic_events[0]!;
    expect(event).toMatchObject({ coordinates: { x: 3, y: 0, z: 0 }, room_preset: 'narrow_concrete_corridor', trigger: 'on_text_reveal_percentage', trigger_value: 50 });
    expect(out.summary).toContain('a 3 m, a la derecha');
    expect(assets.get('assets/audio/sfx/phone.ogg')?.status).toBe('missing');
  });

  it('setVisualNovelSegment escenifica y registra personajes nuevos', async () => {
    await registry.execute(
      'setVisualNovelSegment',
      { node_id: 'rejilla', speakers: [{ character_id: 'quijote', mood: 'solemne', name: 'Don Quijote', sprite_url: 'q.webp' }], dialogue_tree: [{ speaker: 'quijote', text: '¡Gigantes!' }, { speaker: 'sancho', text: 'Molinos.' }] },
      { editor },
    );
    expect(editor.current.character_registry.quijote).toMatchObject({ name: 'Don Quijote', sprites: { solemne: 'q.webp' } });
    expect(editor.node('rejilla')!.visual_novel_overlay!.lines.map((l) => l.speaker)).toEqual(['quijote', 'sancho']);
  });

  it('mountSimulatedModule admite los alias de la arquitectura', async () => {
    await registry.execute('mountSimulatedModule', { node_id: 'rejilla', module_type: 'circuit_puzzle', config: { colors: ['rojo', 'azul'], on_success: { transition_to_node: 'final' } } }, { editor });
    expect(editor.node('rejilla')!.gameplay_overlay).toMatchObject({ type: 'circuit_wiring', parameters: { colors: ['rojo', 'azul'] }, on_success: { transition_to_node: 'final' } });
  });

  it('rechaza argumentos alucinados sin romper nada', async () => {
    const out = await registry.execute('setTypographicEffect', { node_id: 'x', effect_type: 'vortex' }, { editor });
    expect(out.error).toBe('invalid_arguments');
    expect((await registry.execute('rm_rf', {}, { editor })).error).toBe('unknown_tool');
  });

  it('repara parámetros fuera de rango con valores seguros', async () => {
    const out = await registry.execute('setTypographicEffect', { node_id: 'rejilla', effect_type: 'narrow_corridor', parameters: { column_width_rem: 5000 } }, { editor });
    expect(out.issues?.length).toBeGreaterThan(0);
    expect(editor.node('rejilla')!.typographic_engine!.column_width_rem).toBeUndefined();
  });

  it('consultas al lore, continuidad y síntesis', async () => {
    const lore = await LoreGraph.open(await createSqlJsDriver());
    await lore.upsertMany([
      { id: 'sancho', category: 'character', name: 'Sancho Panza' },
      { id: 'yelmo', category: 'item', name: 'yelmo de Mambrino' },
    ]);
    await lore.recordEvent({ timestamp: 1000, subject: 'yelmo', action: 'destroyed' });
    const supervisor = new ContinuitySupervisor(lore);
    const q = await registry.execute('queryLoreGraph', { entity: 'Sancho' }, { editor, lore });
    expect((q.result as { name: string }[])[0]?.name).toBe('Sancho Panza');
    const v = await registry.execute('validateContinuity', { proposed_action: 'Sancho tomó el yelmo de Mambrino.', target_nodes: [] }, { editor, lore, supervisor, timestamp: 2000 });
    expect((v.result as { valid: boolean }).valid).toBe(false);
    const assets = new AssetRegistry();
    const s = await registry.execute('requestAssetSynthesis', { type: 'portrait', prompt: 'Sancho asustado, óleo' }, { editor, assets, synthesizer: new OfflineSynthesizer() });
    expect(s.summary).toContain('pendiente');
    expect(assets.list({ origin: 'synthetic' })[0]).toMatchObject({ path: 'assets/images/portrait_sancho_asustado_oleo.webp', status: 'pending', prompt: 'Sancho asustado, óleo' });
  });
});

/** Proveedor guionizado para probar el bucle del orquestador. */
function scripted(responses: CompletionResponse[]): LlmProvider & { requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  return {
    kind: 'openai',
    model: 'guion',
    requests,
    async complete(req) {
      requests.push(structuredClone(req));
      return responses.shift() ?? { content: 'Fin.', toolCalls: [], stopReason: 'stop' };
    },
  };
}

describe('DirectorOrchestrator', () => {
  it('ejecuta el bucle de herramientas sobre un borrador sin tocar el original', async () => {
    const original = manifest();
    const provider = scripted([
      { content: 'Estrecho el pasillo.', stopReason: 'tool_calls', toolCalls: [{ id: 'a', name: 'setTypographicEffect', arguments: { node_id: 'rejilla', effect_type: 'narrow_corridor', parameters: {} } }] },
      { content: 'Listo: el pasillo se cierra sobre el lector.', stopReason: 'stop', toolCalls: [] },
    ]);
    const orchestrator = new DirectorOrchestrator({ provider });
    const turn = await orchestrator.run({ message: 'Haz el pasillo más asfixiante', manifest: original, context: { nodeId: 'rejilla' } });
    expect(turn.reply).toBe('Listo: el pasillo se cierra sobre el lector.');
    expect(turn.mutated).toBe(true);
    expect(turn.draft.nodes.find((n) => n.node_id === 'rejilla')!.typographic_engine!.layout_mode).toBe('narrow_corridor');
    expect(original.nodes.find((n) => n.node_id === 'rejilla')!.typographic_engine).toBeUndefined();
    expect(provider.requests[1]!.messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'a' });
    expect(turn.history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  it('devuelve errores de herramienta al modelo para que se corrija', async () => {
    const provider = scripted([{ content: '', stopReason: 'tool_calls', toolCalls: [{ id: 'x', name: 'placeSpatialAudio', arguments: { node_id: 'inicio' } }] }]);
    const turn = await new DirectorOrchestrator({ provider }).run({ message: 'sonido', manifest: manifest() });
    const toolMsg = provider.requests[1]!.messages.at(-1)!;
    expect(toolMsg).toMatchObject({ role: 'tool', isError: true });
    expect(turn.mutated).toBe(false);
  });

  it('se detiene ante negativas, errores y bucles infinitos', async () => {
    const refusal = await new DirectorOrchestrator({ provider: scripted([{ content: '', toolCalls: [], stopReason: 'refusal' }]) }).run({ message: 'x', manifest: manifest() });
    expect(refusal.stopReason).toBe('refusal');
    const failing: LlmProvider = { kind: 'openai', model: 'x', complete: async () => Promise.reject(new Error('sin red')) };
    const error = await new DirectorOrchestrator({ provider: failing }).run({ message: 'x', manifest: manifest() });
    expect(error.stopReason).toBe('error');
    expect(error.reply).toContain('sin red');
    const loop: LlmProvider = { kind: 'openai', model: 'x', complete: async () => ({ content: '', stopReason: 'tool_calls', toolCalls: [{ id: 'l', name: 'queryLoreGraph', arguments: { entity: 'x' } }] }) };
    expect((await new DirectorOrchestrator({ provider: loop, maxSteps: 3 }).run({ message: 'x', manifest: manifest() })).stopReason).toBe('max_steps');
  });

  it('funciona 100% offline con el director local', async () => {
    const orchestrator = new DirectorOrchestrator({ provider: new LocalDirectorProvider() });
    const turn = await orchestrator.run({
      message: 'Quiero que el texto tiemble y que se escuche una respiración en la oreja izquierda',
      manifest: manifest(),
      context: { nodeId: 'rejilla', nodeText: 'Te arrastras por la rejilla.' },
    });
    const node = turn.draft.nodes.find((n) => n.node_id === 'rejilla')!;
    expect(node.typographic_engine?.heartbeat_sync?.enabled).toBe(true);
    expect(node.acoustic_events[0]?.coordinates).toEqual({ x: -0.25, y: 0, z: 0 });
    expect(turn.reply).toContain('Propuesta lista');
  });

  it('aplica las llamadas de una Pitch Card', async () => {
    const [pitch] = suggestForBeat('inicio', 'El pasillo angosto; las paredes aplastaban, no podía respirar, estrecho y encerrado.');
    expect(pitch?.title).toBe('Estrechar la página');
    const { draft, mutated } = await new DirectorOrchestrator({ provider: new LocalDirectorProvider() }).applyCalls(pitch!.calls, manifest());
    expect(mutated).toBe(true);
    expect(draft.nodes[0]!.typographic_engine!.column_width_rem).toBe(24);
  });
});

describe('director local', () => {
  it('interpreta indicaciones del doc 04 (grito atrás a 5 metros)', () => {
    const [c] = interpretInstruction('Pon el grito atrás a 5 metros', 'n1');
    expect(c).toMatchObject({ name: 'placeSpatialAudio', arguments: { asset_path: 'assets/audio/sfx/scream.ogg', position_description: 'Pon el grito atrás a 5 metros' } });
  });

  it('propone escenificar diálogos y enigmas', () => {
    const titles = suggestForBeat('n', '—¿Oye?\n—Sí, señor.\n—Es el viento.\nLa cerradura pedía la clave 7391; la cifra era la pista.').map((s) => s.title);
    expect(titles).toContain('Un enigma jugable');
    const dialogue = suggestForBeat('n', '—¿Oye?\n—Sí, señor.\n—Es el viento.', { characters: ['sancho', 'quijote'] });
    expect(dialogue[0]?.calls[0]?.arguments.dialogue_tree).toEqual([
      { speaker: 'sancho', text: '¿Oye?' },
      { speaker: 'quijote', text: 'Sí, señor.' },
      { speaker: 'sancho', text: 'Es el viento.' },
    ]);
  });

  it('ofrece ayuda si no entiende', async () => {
    const res = await new LocalDirectorProvider().complete({ messages: [{ role: 'user', content: 'hola' }], tools: [] });
    expect(res.content).toContain('¿Qué te gustaría?');
  });
});
