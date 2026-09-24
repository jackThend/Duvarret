import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import StudioApp from './StudioApp.vue';
import { MemoryStorage } from '@/core/project';
import { useProjectStore } from './stores/project';
import { useStudioStore } from './stores/studio';
import { useStoryStore } from '@/runtime/stores/story';

let wrapper: VueWrapper;

async function mountStudio() {
  wrapper = mount(StudioApp, { props: { storage: new MemoryStorage(), audioEngine: null }, attachTo: document.body });
  await vi.waitFor(() => expect(wrapper.find('[data-testid="writing-canvas"]').exists()).toBe(true), { timeout: 10000 });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});

describe('Duvarret Studio', () => {
  it('muestra el diseño tripartito con la obra de bienvenida', async () => {
    const w = await mountStudio();
    expect(w.find('[data-testid="left-panel"]').exists()).toBe(true);
    expect(w.find('[data-testid="writing-canvas"]').exists()).toBe(true);
    expect(w.find('[data-testid="live-preview"]').exists()).toBe(true);
    expect((w.get('[data-testid="work-title"]').element as HTMLInputElement).value).toBe('El Laberinto de la Mancha');
    expect(w.get('[data-testid="beat-careo"]').text()).toContain('🎭');
    expect(w.get('[data-testid="beat-embestida"]').text()).toContain('🌀');
  });

  it('actualiza la vista previa en menos de 200 ms al escribir', async () => {
    const w = await mountStudio();
    const project = useProjectStore();
    const prose = w.get('[data-testid="prose"]');
    const started = performance.now();
    await prose.setValue('Un hidalgo de la Mancha soñaba con gigantes.');
    await nextTick();
    const preview = w.get('[data-testid="live-preview"]');
    expect(preview.text()).toContain('Un hidalgo de la Mancha soñaba con gigantes.');
    expect(performance.now() - started).toBeLessThan(200);
    expect(project.dirty).toBe(true);
  });

  it('navega entre escenas y la vista previa la sigue', async () => {
    const w = await mountStudio();
    await w.get('[data-testid="beat-embestida"]').trigger('click');
    await flushPromises();
    expect((w.get('[data-testid="node-title"]').element as HTMLInputElement).value).toBe('La embestida');
    expect(w.get('[data-testid="live-preview"]').text()).toContain('arremetió a todo el galope');
    expect(w.findAll('[data-testid="ghost-marker"]').length).toBeGreaterThanOrEqual(2);
  });

  it('aplica una Pitch Card desde la interfaz', async () => {
    const w = await mountStudio();
    const project = useProjectStore();
    await w.get('[data-testid="beat-prudencia"]').trigger('click');
    await w.get('[data-testid="prose"]').setValue('El pasillo angosto y estrecho, encerrado, sin aire para respirar entre las paredes.');
    useStudioStore().refreshPitches();
    await nextTick();
    await w.get('[data-testid="pitch-adjust-toggle"]').trigger('click');
    expect(w.find('[data-testid="pitch-adjust"]').text()).toContain('Anchura de la página');
    await w.get('[data-testid="pitch-apply"]').trigger('click');
    await flushPromises();
    expect(project.selectedNode!.typographic_engine!.layout_mode).toBe('narrow_corridor');
    expect(w.get('[data-testid="beat-prudencia"]').text()).toContain('🌀');
  });

  it('conversa con el co-director local y aplica su propuesta', async () => {
    const w = await mountStudio();
    const project = useProjectStore();
    await w.get('[data-testid="agent-input"]').setValue('Pon un grito detrás a 5 metros');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(w.findAll('[data-testid="chat-director"]').length).toBe(1);
    await w.get('[data-testid="pitch-apply"]').trigger('click');
    await flushPromises();
    expect(project.selectedNode!.acoustic_events.find((e) => e.event_id === 'grito')?.coordinates).toEqual({ x: 0, y: 0, z: -5 });
    expect(w.find('[data-testid="radar-grito"]').exists()).toBe(true);
  });

  it('el radar mueve fuentes con el teclado', async () => {
    const w = await mountStudio();
    const project = useProjectStore();
    await w.get('[data-testid="radar-viento"]').trigger('keydown', { key: 'ArrowRight' });
    expect(project.selectedNode!.acoustic_events[0]!.coordinates).toEqual({ x: -2.5, y: 1, z: 2 });
    await w.get('[data-testid="radar-viento"]').trigger('keydown', { key: 'ArrowDown', shiftKey: true });
    expect(project.selectedNode!.acoustic_events[0]!.coordinates.z).toBe(0);
  });

  it('subraya contradicciones de continuidad en el lienzo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const w = await mountStudio();
    const project = useProjectStore();
    await project.lore!.recordEvent({ timestamp: 10, subject: 'lanza', action: 'destroyed' });
    await w.get('[data-testid="prose"]').setValue('Don Quijote empuñó la Lanza en astillero y cargó.');
    vi.advanceTimersByTime(450);
    await flushPromises();
    expect(w.get('[data-testid="continuity-mark"]').text()).toBe('Lanza en astillero');
    expect(w.get('[data-testid="continuity-notes"]').text()).toContain('Nota de continuidad');
  });

  it('cambia de tema, colapsa el panel y abre el mapa del lore', async () => {
    const w = await mountStudio();
    await w.get('[data-testid="open-settings"]').trigger('click');
    await w.get('[data-testid="theme-sepia"]').setValue(true);
    await nextTick();
    expect(document.documentElement.dataset.theme).toBe('sepia');
    await w.get('[data-testid="modal-close"]').trigger('click');
    await w.get('[data-testid="open-graph"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="graph-node-quijote"]').exists()).toBe(true);
    await w.get('[data-testid="graph-node-quijote"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="graph-detail"]').text()).toContain('Con vida');
    await w.get('[data-testid="modal-close"]').trigger('click');
    await w.get('[data-testid="toggle-left"]').trigger('click');
    expect(w.find('[data-testid="left-panel"]').exists()).toBe(false);
  });

  it('atajos de teclado: siguiente escena, guardar y modo audio', async () => {
    const w = await mountStudio();
    const project = useProjectStore();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true }));
    expect(project.selectedNodeId).toBe('careo');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    await flushPromises();
    expect(project.dirty).toBe(false);
    expect((project.storage as MemoryStorage).files.manifest).toContain('El Laberinto de la Mancha');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, shiftKey: true }));
    await nextTick();
    expect(useStoryStore().mode).toBe('screenless');
    expect(w.find('[data-testid="screenless-stage"]').exists()).toBe(true);
  });

  it('el diálogo de exportación bloquea obras con escenas rotas', async () => {
    const w = await mountStudio();
    const project = useProjectStore();
    project.patchNode('molinos', { navigation: { default_next_node: 'inexistente' } });
    await w.get('[data-testid="open-export"]').trigger('click');
    expect(w.get('[data-testid="export-blocking"]').text()).toContain('«inexistente»');
  });
});
