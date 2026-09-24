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
