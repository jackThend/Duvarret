import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { Announcer, type Speaker } from './announcer';
import { ScreenlessController, normalizePhrase } from './ScreenlessController';
import { useStoryStore } from '../stores/story';
import { sampleManifest } from '../__fixtures__/sample';
import ScreenlessStage from '../components/ScreenlessStage.vue';
import { RUNTIME_SERVICES } from '../services';
import example from '@/core/manifest/__fixtures__/doc03-example.json';

function setup(manifest: unknown = sampleManifest()) {
  const speaker: Speaker & { spoken: string[] } = { spoken: [], speak: vi.fn((t: string) => speaker.spoken.push(t)), cancel: vi.fn() };
  const announcer = new Announcer(speaker);
  const store = useStoryStore();
  store.load(manifest);
  const controller = new ScreenlessController(store, announcer);
  return { store, announcer, controller, speaker };
}

describe('ScreenlessController', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('narra la escena, el hallazgo pasivo y el menú al entrar', () => {
    const { store, controller, announcer } = setup();
    controller.start();
    store.start();
    const log = announcer.log.value.join(' | ');
    expect(log).toContain('El Pasillo');
    expect(log).toContain('El pasadizo se volvió tan angosto');
    expect(log).toContain('Percibes una brisa tibia.');
    expect(log).toContain('1: Seguir la brisa.');
    expect(store.revealProgress).toBe(100);
  });

  it('elige con el teclado numérico', () => {
    const { store, controller } = setup();
    controller.start();
    store.start();
    expect(controller.handleKey('1')).toBe(true);
    expect(store.currentNodeId).toBe('rejilla');
  });

  it('continúa con Espacio y resuelve la cerradura tecleando el código', () => {
    const { store, controller, announcer } = setup();
    controller.start();
    store.start();
    // "1" es una elección; Espacio avanza por la continuación natural
    controller.handleKey(' ');
    expect(store.currentNodeId).toBe('consola');
    expect(announcer.log.value.at(-1)).toContain('Teclea el código');
    expect(announcer.log.value.join(' ')).toContain('Sancho Panza: ¡Esa consola es una trampa!');
    for (const k of '7390') controller.handleKey(k);
    controller.handleKey('Enter');
    expect(announcer.assertive.value).toContain('Quedan 2 intentos');
    for (const k of '7391') controller.handleKey(k);
    controller.handleKey('Enter');
    expect(store.flags).toContain('alarma_desactivada');
    expect(store.currentNodeId).toBe('final');
  });

  it('agota los intentos y aplica el fracaso', () => {
    const { store, controller } = setup();
    controller.start();
    store.start();
    controller.handleKey(' ');
    for (let i = 0; i < 3; i++) {
      controller.handleKey('0');
      controller.handleKey('Enter');
    }
    expect(store.flags).toContain('alarma_disparada');
  });

  it('usa los atajos del manifiesto y los comandos de voz', () => {
    const manifest = structuredClone(example) as { nodes: { node_id: string }[] };
    manifest.nodes.push({ node_id: 'nodo_023_puzzle_audio' }, { node_id: 'nodo_023_rejilla' });
    const { store, controller } = setup(manifest);
    controller.start();
    store.start();
    // el nodo tiene un enigma obligatorio con código: el menú habla del código
    expect(controller.options).toEqual([]);
    store.resolvePuzzle(true); // transición a nodo inexistente → permanece
    controller.announceOptions();
    expect(controller.options.map((o) => o.label)).toEqual(['hackear consola', 'buscar salida']);
    expect(controller.handleVoice('Quiero BUSCAR SALIDA ya')).toBe(true);
    expect(store.currentNodeId).toBe('nodo_023_rejilla');
  });

  it('anuncia inventario, ayuda y repite', () => {
    const { store, controller, announcer } = setup();
    controller.start();
    store.start();
    controller.handleKey('i');
    expect(announcer.log.value.at(-1)).toBe('Llevas: Sobre con Lacre Negro.');
    controller.handleKey('h');
    expect(announcer.log.value.at(-1)).toContain('Atajos');
    controller.handleKey('r');
    expect(announcer.log.value.at(-1)).toContain('angosto');
    expect(controller.handleKey('x')).toBe(false);
  });

  describe('narración grabada', () => {
    function withRecording(found = true) {
      const manifest = sampleManifest() as { nodes: { node_id: string; screenless_mode?: object }[] };
      manifest.nodes[0]!.screenless_mode = { voice_over_asset: 'assets/audio/voz/inicio.ogg' };
      const plays: { asset: string; id?: string; onEnded?: () => void }[] = [];
      const audio = {
        play: vi.fn(async (asset: string, options: { id?: string; onEnded?: () => void } = {}) => {
          plays.push({ asset, ...options });
          return { id: options.id ?? 'x', asset, label: '', coordinates: { x: 0, y: 0, z: 0 }, loop: false, placeholder: !found };
        }),
        stop: vi.fn(),
      };
      const speaker: Speaker & { spoken: string[] } = { spoken: [], speak: vi.fn((t: string) => speaker.spoken.push(t)), cancel: vi.fn() };
      const announcer = new Announcer(speaker);
      const store = useStoryStore();
      store.load(manifest);
      const controller = new ScreenlessController(store, announcer, audio as never);
      controller.start();
      store.start();
      return { store, announcer, controller, audio, plays };
    }
    const flush = () => new Promise((r) => setTimeout(r, 0));

    it('suena la grabación en lugar de la voz sintética y el menú espera a que termine', async () => {
      const { store, announcer, controller, plays } = withRecording();
      await flush();
      expect(plays.at(-1)?.asset).toBe('assets/audio/voz/inicio.ogg');
      const log = () => announcer.log.value.join(' | ');
      expect(log()).toContain('El Pasillo');
      expect(log()).not.toContain('angosto');
      expect(log()).not.toContain('1: Seguir la brisa');
      // Las teclas ya funcionan mientras suena la voz.
      plays.at(-1)!.onEnded!();
      expect(log()).toContain('Percibes una brisa tibia.');
      expect(log()).toContain('1: Seguir la brisa.');
      expect(controller.handleKey('1')).toBe(true);
      expect(store.currentNodeId).toBe('rejilla');
    });

    it('permite elegir antes de que termine la grabación', async () => {
      const { store, controller } = withRecording();
      await flush();
      expect(controller.handleKey('1')).toBe(true);
      expect(store.currentNodeId).toBe('rejilla');
    });

    it('si falta el archivo, narra con la voz sintética', async () => {
      const { announcer } = withRecording(false);
      await flush();
      expect(announcer.log.value.join(' ')).toContain('angosto');
      expect(announcer.log.value.at(-1)).toContain('1: Seguir la brisa.');
    });

    it('R repite la grabación y S la detiene sin anunciar nada más', async () => {
      const { announcer, controller, audio, plays } = withRecording();
      await flush();
      const first = plays.at(-1)!;
      controller.handleKey('r');
      await flush();
      expect(plays).toHaveLength(2);
      first.onEnded!(); // la anterior ya no cuenta
      expect(announcer.log.value.join(' ')).not.toContain('1: Seguir la brisa');
      controller.handleKey('s');
      expect(audio.stop).toHaveBeenCalledWith('inicio::voz', 150);
      plays.at(-1)!.onEnded!();
      expect(announcer.log.value.join(' ')).not.toContain('1: Seguir la brisa');
      controller.handleKey('o');
      expect(announcer.log.value.at(-1)).toContain('1: Seguir la brisa.');
    });
  });

  it('normaliza frases sin acentos ni signos', () => {
    expect(normalizePhrase('¡Hackear  Consóla!')).toBe('hackear consola');
  });
});

describe('ScreenlessStage', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('expone regiones ARIA live y atiende el teclado', async () => {
    const store = useStoryStore();
    store.load(sampleManifest());
    store.start();
    const announcer = new Announcer(null);
    const wrapper = mount(ScreenlessStage, {
      global: { provide: { [RUNTIME_SERVICES as symbol]: { audio: null, announcer, resolveAsset: (p: string) => p } } },
    });
    await nextTick();
    expect(wrapper.get('[data-testid="live-polite"]').attributes('aria-live')).toBe('polite');
    expect(wrapper.get('[data-testid="live-polite"]').text()).toContain('1: Seguir la brisa');
    await wrapper.trigger('keydown', { key: '1' });
    expect(store.currentNodeId).toBe('rejilla');
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('exit')).toHaveLength(1);
  });
});
