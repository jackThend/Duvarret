import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { checkIntegrity, parseTextMarkers, stripTextMarkers, validateManifest } from '@/core/manifest';
import { speechKey, speechTexts } from '@/core/narration/script';
import { fakeContextFactory } from '@/test/fakeAudio';
import { SpatialAudioEngine } from '../audio/SpatialAudioEngine';
import { useStoryStore } from '../stores/story';
import RuntimePlayer from './RuntimePlayer.vue';

const TEXT = 'Esperó en la oscuridad. Alguien disparó⟦disparo⟧ dos veces.\n\nDespués, silencio⟦eco⟧.';
const work = (mode?: 'contemplative_book') => validateManifest({
  metadata: { title: 'Marcas' },
  ...(mode ? { global_settings: { default_mode: mode } } : {}),
  nodes: [{
    node_id: 'tiro', text_payload: TEXT, navigation: { is_ending: true },
    acoustic_events: [
      { event_id: 'disparo', asset: 'assets/audio/disparo.wav', trigger: 'on_text_marker', trigger_marker: 'disparo' },
      { event_id: 'eco', asset: 'assets/audio/eco.wav', trigger: 'on_text_marker', trigger_marker: 'eco', delay_ms: 500 },
    ],
  }],
}).manifest;
const engine = () => new SpatialAudioEngine({ preferred: 'steam_audio_wasm', contextFactory: fakeContextFactory().factory, loadAsset: async () => new ArrayBuffer(4) });

beforeEach(() => setActivePinia(createPinia()));

describe('marcas de sonido en el texto', () => {
  it('se retiran del texto visible y conservan su posición en porcentaje', () => {
    const { visible, markers } = parseTextMarkers(TEXT);
    expect(visible).toBe('Esperó en la oscuridad. Alguien disparó dos veces.\n\nDespués, silencio.');
    expect(markers.map((m) => [m.name, m.index])).toEqual([['disparo', 39], ['eco', visible.length - 1]]);
    expect(markers[0]!.percentage).toBeCloseTo((39 / visible.length) * 100, 0);
    // No se leen en voz alta, y el texto con marcas suena igual que el limpio (misma grabación).
    expect(speechKey(TEXT)).toBe(speechKey(stripTextMarkers(TEXT)));
    expect(speechTexts(work()).some((t) => t.includes('⟦'))).toBe(false);
  });

  it('un sonido atado a una marca que ya no existe es un aviso con su escena', () => {
    const m = work();
    m.nodes[0]!.text_payload = 'Alguien disparó dos veces.';
    expect(checkIntegrity(m).filter((i) => i.code === 'missing_text_marker')).toEqual([
      expect.objectContaining({ severity: 'warning', nodeId: 'tiro', message: expect.stringContaining('espera la marca «disparo»') }),
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('«eco»') }),
    ]);
  });

  it('en multimedia suena al llegar la lectura a la marca, una sola vez y con su retardo', async () => {
    vi.useFakeTimers();
    try {
      const store = useStoryStore();
      store.load(work());
      expect(store.currentNode).toBeNull();
      expect(store.manifest!.nodes[0]!.text_payload).not.toContain('⟦');
      const audio = engine();
      const play = vi.spyOn(audio, 'playEvent');
      audio.bind(store);
      store.start();
      const at = store.textMarkers.get('tiro')!;
      store.setRevealProgress(at[0]!.percentage - 5);
      expect(play).not.toHaveBeenCalled();
      store.setRevealProgress(at[0]!.percentage);
      expect(play.mock.calls.map(([e]) => e.event_id)).toEqual(['disparo']);
      store.setRevealProgress(100);
      expect(play.mock.calls.map(([e]) => e.event_id)).toEqual(['disparo']);
      await vi.advanceTimersByTimeAsync(500);
      expect(play.mock.calls.map(([e]) => e.event_id)).toEqual(['disparo', 'eco']);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('libro contemplativo: suena al desplazarse hasta la marca', () => {
    const observed: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];
    beforeEach(() => {
      observed.length = 0;
      vi.stubGlobal('IntersectionObserver', class {
        targets: Element[] = [];
        constructor(public callback: IntersectionObserverCallback) { observed.push(this); }
        observe(target: Element) { this.targets.push(target); }
        disconnect() {}
      });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('pinta anclas invisibles y dispara cada marca cuando entra en pantalla, no por el tiempo', async () => {
      vi.useFakeTimers();
      try {
        const audio = engine();
        const play = vi.spyOn(audio, 'playEvent');
        const wrapper = mount(RuntimePlayer, { props: { manifest: work('contemplative_book'), audioEngine: audio, embedded: true }, attachTo: document.body });
        await flushPromises();
        expect(wrapper.text()).not.toContain('⟦');
        const anchors = wrapper.findAll('[data-marker]');
        expect(anchors.map((a) => a.attributes('data-marker'))).toEqual(['disparo', 'eco']);
        expect(anchors[0]!.element.parentElement!.textContent).toBe('Esperó en la oscuridad. Alguien disparó dos veces.');

        // Aunque el tiempo de lectura estimado pase, sin desplazarse no suena.
        await vi.advanceTimersByTimeAsync(20000);
        expect(play).not.toHaveBeenCalled();

        const observer = observed.at(-1)!;
        observer.callback([{ isIntersecting: true, target: observer.targets[0]! } as unknown as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
        expect(play.mock.calls.map(([e]) => e.event_id)).toEqual(['disparo']);
        wrapper.unmount();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
