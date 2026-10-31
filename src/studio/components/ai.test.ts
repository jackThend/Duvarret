import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { MemoryStorage } from '@/core/project';
import { validateManifest } from '@/core/manifest';
import { applyNarration, planNarration } from '@/core/narration/plan';
import { encodeWav } from '@/core/assets/wav';
import { useProjectStore } from '../stores/project';
import { useAiStore } from '../stores/ai';
import { useStudioStore } from '../stores/studio';
import AiConnections from './AiConnections.vue';
import AssetsDialog from './AssetsDialog.vue';
import NarrationDialog from './NarrationDialog.vue';
import PitchCards from './PitchCards.vue';

const service = vi.hoisted(() => ({
  keys: new Map<string, string>(),
  credentialStatus: vi.fn(), setCredential: vi.fn(), removeCredential: vi.fn(), setProviderEndpoint: vi.fn(),
  generateImage: vi.fn(), generateSpeech: vi.fn(), providerFetch: vi.fn(() => vi.fn()),
}));
vi.mock('../services/ai', () => service);
const narration = vi.hoisted(() => ({ narrationStatus: vi.fn(), availableNarrationAssets: vi.fn(), synthesizeNarration: vi.fn() }));
vi.mock('../services/narration', () => narration);
const manifest = () => validateManifest({ metadata: { title: 'Semilla' }, nodes: [{ node_id: 'inicio', title: 'La ventana', text_payload: 'Una hoja busca el sol.', navigation: { is_ending: true } }] }).manifest;

beforeEach(async () => {
  localStorage.clear(); service.keys.clear(); vi.clearAllMocks();
  service.credentialStatus.mockImplementation(async (provider: string) => ({ configured: service.keys.has(provider) }));
  service.setCredential.mockImplementation(async (provider: string, key: string) => { service.keys.set(provider, key); });
  service.removeCredential.mockImplementation(async (provider: string) => { service.keys.delete(provider); });
  narration.narrationStatus.mockRejectedValue(new Error('Motor local ausente en esta prueba.'));
  setActivePinia(createPinia());
  await useProjectStore().open({ manifest: manifest(), storage: new MemoryStorage(), withLore: false });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
});

describe('IA híbrida con claves del autor', () => {
  it('guarda una conexión reutilizable sin poner la clave en preferencias ni en la obra', async () => {
    const w = mount(AiConnections);
    await flushPromises();
    await w.get('[data-testid="provider-key"]').setValue('clave-ficticia-solo-prueba');
    await w.get('[data-testid="ai-save-key"]').trigger('click');
    await flushPromises();
    expect(service.setCredential).toHaveBeenCalledWith('gemini', 'clave-ficticia-solo-prueba');
    expect((w.get('[data-testid="provider-key"]').element as HTMLInputElement).value).toBe('');
    const ai = useAiStore();
    ai.image.model = 'imagen-elegida'; ai.selectSpeech('gemini');
    ai.speech.model = 'voz-elegida';
    await flushPromises();
    expect(ai.image.model).toBe('imagen-elegida');
    expect(JSON.stringify(localStorage)).not.toContain('clave-ficticia-solo-prueba');
    expect(JSON.stringify(useProjectStore().manifest)).not.toContain('clave-ficticia-solo-prueba');
    await ai.requireKey('gemini');
    w.unmount();
  });

  it('migra la clave antigua antes de borrar su copia legacy y conserva esa copia si falla', async () => {
    const legacy = { provider: { kind: 'gemini', model: 'modelo', apiKey: 'secreto-legacy' }, theme: 'nordic' };
    localStorage.setItem('duvarret:studio-settings', JSON.stringify(legacy));
    let finish!: () => void;
    service.setCredential.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const studio = useStudioStore();
    expect(localStorage.getItem('duvarret:studio-settings')).toContain('secreto-legacy');
    expect(studio.provider.apiKey).toBeUndefined();
    finish(); await studio.credentialsReady;
    expect(localStorage.getItem('duvarret:studio-settings')).not.toContain('secreto-legacy');
  });

  it('conserva la copia legacy si falla el almacén de credenciales y muestra el fallo', async () => {
    localStorage.setItem('duvarret:studio-settings', JSON.stringify({ provider: { kind: 'gemini', apiKey: 'legacy-por-proteger' } }));
    service.setCredential.mockRejectedValueOnce(new Error('Almacén no disponible.'));
    const studio = useStudioStore();
    await studio.credentialsReady;
    expect(localStorage.getItem('duvarret:studio-settings')).toContain('legacy-por-proteger');
    expect(studio.provider.apiKey).toBeUndefined();
    expect(studio.credentialError).toBe('Almacén no disponible.');
  });

  it.each(['gemini', 'cloudflare'] as const)('previsualiza una imagen de %s y solo al aceptar guarda bytes, procedencia y asignación', async provider => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0N8AAAAASUVORK5CYII='), c => c.charCodeAt(0));
    service.generateImage.mockResolvedValue({ data: png, mimeType: 'image/png', provider, model: 'modelo-de-prueba' });
    service.keys.set(provider, 'mock-key');
    const project = useProjectStore();
    const w = mount(AssetsDialog);
    await w.get('[data-testid="image-provider"]').setValue(provider);
    if (provider === 'cloudflare') await w.get('[data-testid="image-account"]').setValue('a'.repeat(32));
    await w.get('[data-testid="image-prompt"]').setValue('Una hoja verde junto a una ventana.');
    await w.get('[data-testid="image-generate"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="image-preview"]').exists()).toBe(true);
    expect(project.nodes[0]?.illustration).toBeUndefined();
    await w.get('[data-testid="image-accept"]').trigger('click');
    await flushPromises();
    const path = project.nodes[0]?.illustration?.asset;
    expect(path).toMatch(/\.png$/);
    expect(project.assetOverrides.has(path!)).toBe(true);
    expect(project.assets.get(path!)?.bytes).toBe(png.length);
    expect(project.assets.get(path!)?.origin).toBe('synthetic');
    expect(project.assets.get(path!)?.provider).toBe(`${provider} · modelo-de-prueba`);
    expect(project.assets.get(path!)?.prompt).toContain('hoja verde');
    expect(w.find('[data-testid="image-preview"]').exists()).toBe(false);
    w.unmount();
  });

  it('la voz nube no depende del motor local, se exporta sin secretos y regenera solo texto nuevo', async () => {
    service.keys.set('gemini', 'mock-cloud-key');
    const wav = encodeWav(new Float32Array(100), 24000);
    service.generateSpeech.mockResolvedValue({ data: wav, mimeType: 'audio/wav', provider: 'gemini', model: 'tts-prueba' });
    const project = useProjectStore();
    const w = mount(NarrationDialog);
    await w.get('[data-testid="narration-provider"]').setValue('gemini');
    await w.get('[data-testid="narration-model"]').setValue('tts-prueba');
    await w.get('[data-testid="narration-cloud-voice"]').setValue('Kore');
    expect(w.get('[data-testid="narration-update"]').attributes('disabled')).toBeUndefined();
    await w.get('[data-testid="narration-update"]').trigger('click');
    await vi.waitFor(() => expect(project.narrationBusy).toBe(false), { timeout: 10000 });
    await flushPromises();
    expect(w.find('[data-testid="narration-error"]').exists() ? w.get('[data-testid="narration-error"]').text() : '', 'La voz nube no debe depender de la comprobación del motor local.').toBe('');
    expect(project.manifest.global_settings.narration_voice?.provider).toBe('gemini');
    expect(narration.synthesizeNarration).not.toHaveBeenCalled();
    expect(project.manifest.global_settings.narration_voice?.model).toBe('tts-prueba');
    const firstCount = service.generateSpeech.mock.calls.length;
    expect(firstCount).toBeGreaterThan(5);
    await project.updateNarration();
    expect(service.generateSpeech).toHaveBeenCalledTimes(firstCount);
    project.updateText('inicio', 'La hoja nueva busca el sol.');
    await project.updateNarration();
    expect(service.generateSpeech).toHaveBeenCalledTimes(firstCount + 1);
    expect(JSON.stringify(project.manifest)).not.toContain('mock-cloud-key');
    expect(project.manifest.global_settings.narration_voice?.clips.some(clip => clip.text === 'La hoja nueva busca el sol.')).toBe(true);
    w.unmount();
  });

  it('cambiar de modelo o de voz genera rutas nuevas y volver a la misma elección reutiliza', async () => {
    const selection = { provider: 'gemini' as const, model: 'modelo-a', voice: 'Kore' };
    const first = await planNarration(manifest(), () => false, undefined, selection);
    const withVoice = applyNarration(manifest(), first);
    const changed = await planNarration(withVoice, () => true, undefined, { ...selection, model: 'modelo-b' });
    expect(changed.clips[0]?.asset).not.toBe(first.clips[0]?.asset);
    const reused = await planNarration(withVoice, () => true);
    expect(reused.clips).toEqual(first.clips);
  });

  it('no aplica sobre la obra B el borrador A que devuelve una herramienta después de cambiar de obra', async () => {
    service.keys.set('gemini', 'mock-key');
    let finish!: (value: { data: Uint8Array; mimeType: string; provider: string; model: string }) => void;
    service.generateImage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const project = useProjectStore();
    const studio = useStudioStore();
    studio.pitches.push({ id: 'propuesta-tardia', nodeId: 'inicio', title: 'Ilustrar', rationale: '', source: 'proactive', status: 'open', calls: [{ id: 'imagen', name: 'requestAssetSynthesis', arguments: { type: 'background', prompt: 'Una ventana junto al mar.', style_preset: 'editorial' } }] });
    const pending = studio.applyPitch('propuesta-tardia');
    await vi.waitFor(() => expect(service.generateImage).toHaveBeenCalledOnce());
    const other = validateManifest({ metadata: { title: 'La obra B' }, nodes: [{ node_id: 'otra', text_payload: 'Este texto no puede cambiar.', navigation: { is_ending: true } }] }).manifest;
    await project.open({ manifest: other, storage: new MemoryStorage('obra-b'), withLore: false });
    const unchanged = JSON.stringify(project.manifest);
    finish({ data: new Uint8Array([137, 80, 78, 71]), mimeType: 'image/png', provider: 'gemini', model: 'mock-image' });
    expect(await pending).toBe(false);
    expect(JSON.stringify(project.manifest)).toBe(unchanged);
    expect(studio.pitches.find(card => card.id === 'propuesta-tardia')?.status).toBe('open');
    expect(project.assets.list()).toHaveLength(0);
  });

  it('conserva texto, títulos y escenas editados mientras se genera una imagen de la propuesta', async () => {
    service.keys.set('gemini', 'mock-key');
    let finish!: (value: { data: Uint8Array; mimeType: string; provider: string; model: string }) => void;
    service.generateImage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const project = useProjectStore();
    const studio = useStudioStore();
    studio.pitches.push({ id: 'imagen-lenta', nodeId: 'inicio', title: 'Ilustrar', rationale: '', source: 'proactive', status: 'open', calls: [{ id: 'imagen', name: 'requestAssetSynthesis', arguments: { type: 'background', prompt: 'Una ventana junto al mar.', style_preset: 'editorial' } }] });
    const pending = studio.applyPitch('imagen-lenta');
    await vi.waitFor(() => expect(service.generateImage).toHaveBeenCalledOnce());
    project.updateText('inicio', 'Este párrafo lo escribió la autora mientras esperaba.');
    project.updateTitle('inicio', 'Un título nuevo');
    project.setMetadata({ title: 'La obra revisada' });
    project.addNode('inicio', { title: 'Otra escena' });
    const voice = await planNarration(project.manifest, () => false, undefined, { provider: 'gemini', model: 'voz-nueva', voice: 'Kore' });
    project.applyDraft(applyNarration(project.manifest, voice));
    const unchanged = project.manifest;
    finish({ data: new Uint8Array([137, 80, 78, 71]), mimeType: 'image/png', provider: 'gemini', model: 'mock-image' });
    expect(await pending).toBe(false);
    expect(project.manifest).toBe(unchanged);
    expect(project.manifest.global_settings.narration_voice?.model).toBe('voz-nueva');
    expect(studio.chat.at(-1)?.text).toContain('La obra cambió desde esta propuesta');
    expect(studio.pitches[0]?.status).toBe('dismissed');
  });

  function prepareDirectorResponse() {
    const toolResponse = () => new Response(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: 'tipografia', type: 'function', function: { name: 'setTypographicEffect', arguments: JSON.stringify({ node_id: 'inicio', effect_type: 'narrow_corridor', parameters: {} }) } }] } }] }));
    const finalResponse = () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'He preparado el pasillo.' } }] }));
    return { toolResponse, finalResponse };
  }

  it('descarta la respuesta del director si la autora editó la obra durante la petición', async () => {
    const { toolResponse, finalResponse } = prepareDirectorResponse();
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; })).mockImplementation(async () => finalResponse());
    service.providerFetch.mockImplementation(() => fetch);
    const project = useProjectStore();
    const studio = useStudioStore();
    studio.provider = { kind: 'openai', model: 'modelo-prueba' };
    const pending = studio.ask('Estrecha el pasillo.');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    project.updateText('inicio', 'La autora sigue escribiendo.');
    const unchanged = project.manifest;
    finish(toolResponse());
    expect(await pending).toBeNull();
    expect(studio.pitches).toHaveLength(0);
    expect(project.manifest).toBe(unchanged);
    expect(studio.chat.at(-1)?.text).toContain('La obra cambió desde esta propuesta');
  });

  it.each([false, true])('acepta el borrador del chat solo si la obra sigue vigente (edición posterior: %s)', async edited => {
    const { toolResponse, finalResponse } = prepareDirectorResponse();
    service.providerFetch.mockImplementation(() => vi.fn().mockImplementationOnce(async () => toolResponse()).mockImplementation(async () => finalResponse()));
    const project = useProjectStore();
    const studio = useStudioStore();
    studio.provider = { kind: 'openai', model: 'modelo-prueba' };
    await studio.ask('Estrecha el pasillo.');
    const card = studio.pitches[0]!;
    expect(card.draft?.nodes[0]?.typographic_engine?.layout_mode).toBe('narrow_corridor');
    if (edited) project.updateTitle('inicio', 'La decisión de la autora');
    const unchanged = project.manifest;
    expect(await studio.applyPitch(card.id)).toBe(!edited);
    if (edited) {
      expect(project.manifest).toBe(unchanged);
      expect(studio.chat.at(-1)?.text).toContain('La obra cambió desde esta propuesta');
    } else {
      expect(project.nodes[0]?.typographic_engine?.layout_mode).toBe('narrow_corridor');
      expect(card.status).toBe('applied');
    }
  });

  it('aplica llamadas proactivas sobre el texto vigente y tolera cambios del catálogo de recursos', async () => {
    const project = useProjectStore();
    const studio = useStudioStore();
    studio.pitches.push({ id: 'pasillo', nodeId: 'inicio', title: 'Estrechar', rationale: '', source: 'proactive', status: 'open', calls: [{ id: 'tipografia', name: 'setTypographicEffect', arguments: { node_id: 'inicio', effect_type: 'narrow_corridor', parameters: {} } }] });
    project.updateText('inicio', 'Texto revisado antes de aceptar.');
    const pending = studio.applyPitch('pasillo');
    project.touchAssets();
    expect(await pending).toBe(true);
    expect(project.nodes[0]?.text_payload).toBe('Texto revisado antes de aceptar.');
    expect(project.nodes[0]?.typographic_engine?.layout_mode).toBe('narrow_corridor');
  });

  it.each([
    ['compatible', 'http://localhost:1234/v1', '/chat/completions'],
    ['ollama', 'http://127.0.0.1:11435', '/api/chat'],
  ] as const)('guardar %s en Conexiones basta para usar su dirección al conversar', async (provider, endpoint, suffix) => {
    const calls: string[] = [];
    service.providerFetch.mockImplementation(() => vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(provider === 'ollama' ? { message: { role: 'assistant', content: 'Hola.' }, done: true } : { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Hola.' } }] }), { headers: { 'content-type': 'application/json' } });
    }));
    const w = mount(AiConnections);
    await flushPromises();
    await w.get('[data-testid="ai-connection-provider"]').setValue(provider);
    await w.get('[data-testid="ai-endpoint"]').setValue(endpoint);
    await w.get('[data-testid="ai-save-key"]').trigger('click');
    await flushPromises();
    expect(service.setProviderEndpoint).toHaveBeenCalledWith(provider, endpoint);
    const studio = useStudioStore();
    studio.provider = { kind: provider, model: 'modelo-local' };
    await studio.ask('Hola.');
    expect(calls).toEqual([`${endpoint}${suffix}`]);
    expect(studio.serviceEndpoint).toBe(endpoint);
    w.unmount();
  });

  it('migra la dirección legacy al transporte antes de la primera petición', async () => {
    const endpoint = 'http://localhost:1234/v1';
    const order: string[] = [];
    service.setProviderEndpoint.mockImplementationOnce(async () => { order.push('endpoint'); });
    service.providerFetch.mockImplementation(() => vi.fn(async (url: string) => {
      order.push(url);
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Hola.' } }] }));
    }));
    localStorage.setItem('duvarret:studio-settings', JSON.stringify({ provider: { kind: 'compatible', model: 'modelo-local', baseUrl: endpoint } }));
    const studio = useStudioStore();
    await studio.ask('Hola.');
    expect(order).toEqual(['endpoint', `${endpoint}/chat/completions`]);
    expect(useAiStore().endpoints.compatible).toBe(endpoint);
    expect(studio.provider.baseUrl).toBeUndefined();
  });

  it('comienza un historial de modelo nuevo al cambiar de modelo y conserva el chat visible', async () => {
    const requests: { messages: { content: string }[] }[] = [];
    service.providerFetch.mockImplementation(() => vi.fn(async (_url: string, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as { messages: { content: string }[] });
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Respuesta.' } }] }));
    }));
    const studio = useStudioStore();
    studio.provider = { kind: 'openai', model: 'modelo-a' };
    await studio.ask('Primera conversación.');
    await studio.ask('Segunda intervención.');
    expect(requests[1]?.messages.some(message => message.content === 'Primera conversación.')).toBe(true);
    studio.provider.model = 'modelo-b';
    await studio.ask('Una conversación nueva.');
    expect(requests[2]?.messages.some(message => message.content === 'Primera conversación.')).toBe(false);
    expect(studio.chat.filter(entry => entry.role === 'author')).toHaveLength(3);
  });
});

describe('voz creada por el director', () => {
  const voiceRequest = 'Ponme una voz que susurre «no mires atrás» a mi oído derecho';
  async function askForVoice() {
    service.keys.set('gemini', 'mock-key');
    service.generateSpeech.mockResolvedValue({ data: encodeWav(new Float32Array(2400).fill(0.2), 24000), mimeType: 'audio/wav', provider: 'gemini', model: 'tts-prueba' });
    useAiStore().selectSpeech('gemini');
    const studio = useStudioStore();
    await studio.ask(voiceRequest);
    const card = studio.pitches.at(-1)!;
    const path = card.executions![0]!.outcome.result as { path: string };
    return { studio, card, path: path.path, project: useProjectStore() };
  }

  it('se escucha en la propuesta y rechazarla no deja rastro en la obra', async () => {
    const { studio, card, path, project } = await askForVoice();
    expect(service.generateSpeech).toHaveBeenCalledWith(expect.objectContaining({ text: 'no mires atrás', style: expect.stringContaining('susurrando') }));
    expect(project.draftAssets.has(path)).toBe(true);
    expect(project.resolveAsset(path)).toMatch(/^blob:/);
    expect(project.assets.get(path)).toBeUndefined();
    expect(project.nodes[0]!.acoustic_events).toHaveLength(0);
    const w = mount(PitchCards);
    expect(w.get('[data-testid="pitch-drafts"]').text()).toContain('Voz: «no mires atrás»');
    expect(w.find('[data-testid="pitch-listen"]').exists()).toBe(true);
    await w.get('[data-testid="pitch-dismiss"]').trigger('click');
    expect(card.status).toBe('dismissed');
    expect(project.draftAssets.size).toBe(0);
    expect(project.resolveAsset(path)).toBe(path);
    expect(project.assets.list()).toHaveLength(0);
    expect(project.dirty).toBe(false);
    expect(studio.chat.at(-1)?.text).toBeTruthy();
    w.unmount();
  });

  it('al aceptarla queda colocada en su sitio y registrada con su procedencia', async () => {
    const { studio, card, path, project } = await askForVoice();
    expect(await studio.applyPitch(card.id)).toBe(true);
    const event = project.nodes[0]!.acoustic_events.find(e => e.asset === path)!;
    expect(event.coordinates).toEqual({ x: 0.25, y: 0, z: 0 });
    expect(project.assets.get(path)).toMatchObject({ origin: 'synthetic', status: 'ready', prompt: 'no mires atrás', style_preset: 'susurrando', provider: 'gemini · tts-prueba · Kore' });
    expect(project.draftAssets.size).toBe(0);
    expect(project.resolveAsset(path)).toMatch(/^blob:/);
  });

  it('sin servicio de voz ni escritorio, explica cómo conseguirla', async () => {
    const studio = useStudioStore();
    await studio.ask(voiceRequest);
    expect(studio.pitches).toHaveLength(0);
    expect(studio.chat.map(entry => entry.text).join(' ')).toContain('La voz incluida solo funciona con la obra abierta en la app de escritorio');
    expect(useProjectStore().draftAssets.size).toBe(0);
  });
});
