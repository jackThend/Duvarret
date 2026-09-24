import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RuntimePlayer from './RuntimePlayer.vue';
import { sampleManifest } from '../__fixtures__/sample';
import { SpatialAudioEngine } from '../audio/SpatialAudioEngine';
import { fakeContextFactory } from '@/test/fakeAudio';
import example from '@/core/manifest/__fixtures__/doc03-example.json';

function engine() {
  return new SpatialAudioEngine({ preferred: 'steam_audio_wasm', contextFactory: fakeContextFactory().factory, loadAsset: async () => new ArrayBuffer(4) });
}

describe('RuntimePlayer (integración)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('recorre la obra completa: portada, ergódico, audio, novela visual, enigma y final', async () => {
    const audio = engine();
    const wrapper = mount(RuntimePlayer, { props: { manifest: sampleManifest(), audioEngine: audio, persistKey: 'prueba' }, attachTo: document.body });
    expect(wrapper.get('[data-testid="cover"]').text()).toContain('La Sombra del Molino');
    await wrapper.get('[data-testid="begin"]').trigger('click');
    await flushPromises();

    // Nodo 1: pasillo angosto + gotera 3D + hallazgo pasivo
    expect(wrapper.get('[data-testid="ergodic-column"]').attributes('style')).toContain('--dv-column-width: 24rem');
    expect(wrapper.text()).toContain('Percibes una brisa tibia.');
    expect(audio.active.map((v) => v.id)).toContain('inicio::gotera');

    // El progreso de lectura dispara los pasos al 60%
    await wrapper.get('[data-testid="skip-reading"]').trigger('click');
    await flushPromises();
    expect(audio.active.map((v) => v.id)).toContain('inicio::pasos');

    // Chequeo activo con probabilidad explícita
    expect(wrapper.get('[data-testid="check-1"]').text()).toMatch(/probabilidad \d+%/);
    await wrapper.get('[data-testid="check-1"]').trigger('click');
    expect(wrapper.get('[data-testid="check-result-1"]').text()).toMatch(/Contener el pánico: \d \+ \d → \d+/);

    // Continuar → consola: diálogo y cerradura obligatoria
    await wrapper.get('[data-testid="continue"]').trigger('click');
    await wrapper.get('[data-testid="skip-reading"]').trigger('click');
    expect(wrapper.find('[data-testid="continue"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="visual-novel"]').text()).toContain('Sancho Panza');
    await wrapper.get('[data-testid="vn-box"]').trigger('click'); // completa
    await wrapper.get('[data-testid="vn-box"]').trigger('click'); // termina
    const lock = wrapper.get('[data-testid="cipher-lock"]');
    for (const k of '7391') await lock.trigger('keydown', { key: k });
    await lock.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(wrapper.get('[data-testid="ending"]').text()).toContain('Fin');
    expect(JSON.parse(localStorage.getItem('prueba')!).nodeId).toBe('final');
    wrapper.unmount();
  });

  it('elige con las teclas numéricas', async () => {
    const wrapper = mount(RuntimePlayer, { props: { manifest: sampleManifest(), audioEngine: null, embedded: true } });
    await flushPromises();
    await wrapper.get('[data-testid="runtime-player"]').trigger('keydown', { key: '1' });
    expect(wrapper.emitted('node')!.at(-1)).toEqual(['rejilla']);
  });

  it('muestra el inventario e inspecciona objetos', async () => {
    const wrapper = mount(RuntimePlayer, { props: { manifest: sampleManifest(), audioEngine: null, embedded: true } });
    await wrapper.get('[data-testid="toggle-inventory"]').trigger('click');
    await wrapper.get('[data-testid="item-sobre_lacrado"]').trigger('click');
    expect(wrapper.get('[data-testid="item-detail"]').text()).toContain("Cifra '7391'.");
  });

  it('conmuta al modo sin pantalla', async () => {
    const wrapper = mount(RuntimePlayer, { props: { manifest: sampleManifest(), audioEngine: null, embedded: true } });
    await wrapper.get('[data-testid="toggle-screenless"]').trigger('click');
    expect(wrapper.find('[data-testid="screenless-stage"]').exists()).toBe(true);
  });

  it('se reconstruye en vivo cuando cambia el manifiesto (Live Preview)', async () => {
    const wrapper = mount(RuntimePlayer, { props: { manifest: sampleManifest(), audioEngine: null, embedded: true } });
    const changed = sampleManifest();
    changed.nodes![0]!.text_payload = 'Texto reescrito por la autora.';
    await wrapper.setProps({ manifest: changed });
    expect(wrapper.text()).toContain('Texto reescrito por la autora.');
  });

  it('reproduce el ejemplo del doc 03 sin romperse aunque falten escenas', async () => {
    const wrapper = mount(RuntimePlayer, { props: { manifest: example, audioEngine: null, embedded: true } });
    expect(wrapper.text()).toContain('El eco de las gotas');
    expect(wrapper.find('[data-testid="flashlight"]').exists()).toBe(true);
  });

  it('muestra un mensaje amable si la obra está vacía', () => {
    const wrapper = mount(RuntimePlayer, { props: { manifest: { nodes: [] }, audioEngine: null, embedded: true } });
    expect(wrapper.get('[data-testid="empty"]').text()).toContain('todavía no tiene escenas');
  });

  it('resuelve assets relativos al proyecto', async () => {
    const m = sampleManifest();
    m.nodes![0]!.illustration = { asset: 'assets/images/pasillo.webp', alt: 'Pasillo' };
    const wrapper = mount(RuntimePlayer, { props: { manifest: m, audioEngine: null, embedded: true, assetBase: 'works/obra.duvarret/' } });
    expect(wrapper.get('.dv-illustration img').attributes('src')).toBe('works/obra.duvarret/assets/images/pasillo.webp');
  });
});
