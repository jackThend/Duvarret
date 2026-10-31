import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { MemoryStorage } from '@/core/project';
import { encodeWav } from '@/core/assets/wav';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { useProjectStore } from '../stores/project';
import NarrationDialog from './NarrationDialog.vue';
import WritingCanvas from './WritingCanvas.vue';
import { ManifestEditor } from '@/core/agent/manifestEditor';
import { validateManifest } from '@/core/manifest';
import { speechTexts } from '@/core/narration/script';

const recorder = vi.hoisted(() => ({
  canRecord: vi.fn(() => true),
  startRecording: vi.fn(),
}));
vi.mock('../services/recorder', () => recorder);
const synthesis = vi.hoisted(() => ({ availableNarrationAssets: vi.fn(), synthesizeNarration: vi.fn(), narrationStatus: vi.fn() }));
vi.mock('../services/narration', () => synthesis);

beforeEach(async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  recorder.canRecord.mockReturnValue(true);
  recorder.startRecording.mockReset();
  synthesis.narrationStatus.mockReset();
  synthesis.narrationStatus.mockResolvedValue({ ready: true, message: 'Voz local incluida, lista para narrar sin internet.' });
  const project = useProjectStore();
  await project.open({ manifest: sampleManifest(), storage: new MemoryStorage(), withLore: false });
  project.select('inicio');
});

const voiceOf = (id: string) => useProjectStore().nodes.find((n) => n.node_id === id)?.screenless_mode?.voice_over_asset;

describe('Narración grabada', () => {
  it('actualiza desde la app, guarda y conserva los cambios hechos durante la generación', async () => {
    const project = useProjectStore();
    const saved = vi.fn(async () => undefined);
    await project.open({ manifest: sampleManifest(), storage: { kind: 'tauri', location: 'obra', load: vi.fn(), save: saved }, withLore: false });
    synthesis.availableNarrationAssets.mockResolvedValue(new Set());
    let finish!: () => void;
    synthesis.synthesizeNarration.mockImplementation((_root, plan) => new Promise(resolve => {
      finish = () => resolve(plan.pending.map((clip: { text: string; asset: string }) => ({ ...clip, bytes: 200 })));
    }));
    const w = mount(NarrationDialog);
    await flushPromises();
    await w.get('[data-testid="narration-delivery"]').setValue('sweet');
    await w.get('[data-testid="narration-update"]').trigger('click');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(w.get('[data-testid="narration-update"]').attributes('disabled')).toBeDefined();
    project.updateText('inicio', 'Una frase editada mientras se genera la voz.');
    finish();
    await vi.waitFor(() => expect(project.narrationBusy).toBe(false));
    expect(project.nodes[0]?.text_payload).toBe('Una frase editada mientras se genera la voz.');
    expect(project.manifest.global_settings.narration_voice?.delivery).toBe('sweet');
    expect(project.canExport).toBe(false);
    expect(saved).toHaveBeenCalledOnce();
    expect(w.get('[data-testid="narration-message"]').text()).toContain('texto cambió');
    w.unmount();
  });

  it('un fallo del modelo conserva la obra y permite reintentar sin cerrarla', async () => {
    const project = useProjectStore();
    await project.open({ manifest: sampleManifest(), storage: { kind: 'tauri', location: 'obra', load: vi.fn(), save: vi.fn() }, withLore: false });
    const before = project.manifest;
    synthesis.availableNarrationAssets.mockResolvedValue(new Set());
    synthesis.synthesizeNarration.mockRejectedValueOnce(new Error('Motor no disponible.'));
    const w = mount(NarrationDialog);
    await flushPromises();
    await w.get('[data-testid="narration-update"]').trigger('click');
    await vi.waitFor(() => expect(w.get('[data-testid="narration-error"]').text()).toContain('Motor no disponible'));
    expect(project.manifest).toBe(before);
    expect(project.narrationBusy).toBe(false);
    w.unmount();
  });

  it('bloquea la generación si falta la voz incluida y permite comprobar la reparación sin perder la obra', async () => {
    const project = useProjectStore();
    await project.open({ manifest: sampleManifest(), storage: { kind: 'tauri', location: 'obra', load: vi.fn(), save: vi.fn() }, withLore: false });
    const before = project.manifest;
    synthesis.narrationStatus.mockResolvedValueOnce({ ready: false, message: 'La voz incluida está incompleta. Vuelve a ejecutar el instalador para repararla.' });
    const wrapper = mount(NarrationDialog);
    await flushPromises();
    expect(wrapper.get('[data-testid="narration-engine-status"]').text()).toContain('instalador');
    expect(wrapper.get('[data-testid="narration-update"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="narration-local"]').text()).toContain('sin internet');
    await wrapper.get('[data-testid="narration-check-engine"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="narration-update"]').attributes('disabled')).toBeUndefined();
    expect(project.manifest).toBe(before);
    wrapper.unmount();
  });

  it('la síntesis de una obra anterior nunca modifica otra que se acaba de abrir', async () => {
    const project = useProjectStore();
    await project.open({ manifest: sampleManifest(), storage: { kind: 'tauri', location: 'primera', load: vi.fn(), save: vi.fn() }, withLore: false });
    synthesis.availableNarrationAssets.mockResolvedValue(new Set());
    let finish!: () => void;
    synthesis.synthesizeNarration.mockImplementation(() => new Promise(resolve => { finish = () => resolve([]); }));
    const task = project.updateNarration();
    const failed = expect(task).rejects.toThrow('obra anterior');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await project.open({ manifest: { metadata: { title: 'Otra obra' }, nodes: [] }, storage: new MemoryStorage(), withLore: false });
    finish();
    await failed;
    expect(project.manifest.metadata.title).toBe('Otra obra');
    expect(project.manifest.global_settings.narration_voice).toBeUndefined();
  });
  it('mantiene la voz al editar en Studio y avisa que la grabación del texto cambió', async () => {
    const manifest = validateManifest(sampleManifest()).manifest;
    const original = manifest.nodes[0]!.text_payload;
    const editor = new ManifestEditor(manifest);
    editor.patchNode('inicio', { screenless_mode: { narration_text: original } });
    editor.patchManifest({ global_settings: { narration_voice: { voice_id: 'kokoro:ef_dora', label: 'Dora', clips: speechTexts(editor.current).map((text, i) => ({ text, asset: `assets/audio/${i}.wav` })) } } });
    const project = useProjectStore();
    await project.open({ manifest: editor.current, storage: new MemoryStorage(), withLore: false });
    expect(project.canExport).toBe(true);
    const wrapper = mount(NarrationDialog);
    const canvas = mount(WritingCanvas);
    await canvas.get('[data-testid="prose"]').setValue('Una escena corregida desde la app.');
    await flushPromises();
    expect(project.manifest.global_settings.narration_voice?.voice_id).toBe('kokoro:ef_dora');
    expect(project.nodes[0]!.screenless_mode?.narration_text).toBe('Una escena corregida desde la app.');
    expect(project.canExport).toBe(false);
    expect(wrapper.get('[data-testid="narration-pending"]').text()).toContain('frases por actualizar');
    expect(wrapper.get('[data-testid="narration-text"]').text()).toContain('Una escena corregida');
    canvas.unmount();
    wrapper.unmount();
  });
  it('muestra el texto a leer y la cobertura', () => {
    const w = mount(NarrationDialog);
    expect(w.get('[data-testid="narration-coverage"]').text()).toBe('0 de 4 escenas con voz grabada');
    expect(w.get('[data-testid="narration-text"]').text()).toContain('angosto');
  });

  it('graba, guarda como WAV, asigna la narración y regraba sobre el mismo archivo', async () => {
    const stop = vi.fn(async () => ({ data: encodeWav(new Float32Array(2400).fill(0.3), 24000), seconds: 0.1 }));
    recorder.startRecording.mockResolvedValue({ stop, cancel: vi.fn() });
    const w = mount(NarrationDialog);
    await w.get('[data-testid="narration-record"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="narration-clock"]').exists()).toBe(true);
    await w.get('[data-testid="narration-stop"]').trigger('click');
    await flushPromises();
    expect(voiceOf('inicio')).toBe('assets/audio/narracion_inicio.wav');
    expect(useProjectStore().assets.get('assets/audio/narracion_inicio.wav')?.origin).toBe('author');
    expect(w.get('[data-testid="narration-message"]').text()).toContain('Narración guardada');
    expect(w.get('[data-testid="narration-coverage"]').text()).toBe('1 de 4 escenas con voz grabada');

    await w.get('[data-testid="narration-record"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="narration-stop"]').trigger('click');
    await flushPromises();
    expect(voiceOf('inicio')).toBe('assets/audio/narracion_inicio.wav');
    expect([...useProjectStore().assetPaths].filter((p) => p.includes('narracion'))).toHaveLength(1);
  });

  it('cerrar en plena grabación guarda la toma en vez de descartarla', async () => {
    const stop = vi.fn(async () => ({ data: encodeWav(new Float32Array(2400).fill(0.3), 24000), seconds: 0.1 }));
    const cancel = vi.fn();
    recorder.startRecording.mockResolvedValue({ stop, cancel });
    const w = mount(NarrationDialog);
    await w.get('[data-testid="narration-record"]').trigger('click');
    await flushPromises();
    await w.get('[aria-label="Cerrar"]').trigger('click');
    await flushPromises();
    expect(stop).toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(voiceOf('inicio')).toBeTruthy();
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('explica por qué no puede grabar', async () => {
    recorder.startRecording.mockRejectedValue(new Error('No hay permiso para usar el micrófono (o no hay ninguno conectado).'));
    const w = mount(NarrationDialog);
    await w.get('[data-testid="narration-record"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="narration-error"]').text()).toContain('micrófono');
    expect(voiceOf('inicio')).toBeUndefined();
  });

  it('sin micrófono permite importar un archivo, pasar a la siguiente escena y quitar la narración', async () => {
    recorder.canRecord.mockReturnValue(false);
    const w = mount(NarrationDialog);
    expect(w.get('[data-testid="narration-record"]').attributes('disabled')).toBeDefined();
    const input = w.get('[data-testid="narration-import"]');
    const file = new File([new Uint8Array([1, 2, 3])], 'Mi voz.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await vi.waitFor(() => expect(voiceOf('inicio')).toBe('assets/audio/mi_voz.mp3'));

    await w.get('[data-testid="narration-next"]').trigger('click');
    expect(w.get('[data-testid="narration-scene-consola"]').attributes('aria-current')).toBe('true');
    await w.get('[data-testid="narration-scene-inicio"]').trigger('click');
    await w.get('[data-testid="narration-remove"]').trigger('click');
    expect(voiceOf('inicio')).toBeUndefined();
  });
});
