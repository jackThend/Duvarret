import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { MemoryStorage } from '@/core/project';
import { encodeWav } from '@/core/assets/wav';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { useProjectStore } from '../stores/project';
import NarrationDialog from './NarrationDialog.vue';

const recorder = vi.hoisted(() => ({
  canRecord: vi.fn(() => true),
  startRecording: vi.fn(),
}));
vi.mock('../services/recorder', () => recorder);

beforeEach(async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  recorder.canRecord.mockReturnValue(true);
  recorder.startRecording.mockReset();
  const project = useProjectStore();
  await project.open({ manifest: sampleManifest(), storage: new MemoryStorage(), withLore: false });
  project.select('inicio');
});

const voiceOf = (id: string) => useProjectStore().nodes.find((n) => n.node_id === id)?.screenless_mode?.voice_over_asset;

describe('Narración grabada', () => {
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
