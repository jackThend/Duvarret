import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { BrowserStorage, MemoryStorage, type ProjectStorage } from '@/core/project';
import { useProjectStore } from './project';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import AssetsDialog from '../components/AssetsDialog.vue';

const wav = () => new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

async function opened(storage: ProjectStorage = new MemoryStorage()) {
  const project = useProjectStore();
  await project.open({ manifest: sampleManifest(), storage, withLore: false });
  return project;
}

describe('recursos de la obra (store)', () => {
  it('aporta un archivo, lo registra como obra de la autora y lo sirve en la vista previa', async () => {
    const project = await opened();
    const path = await project.addAsset({ name: 'Gotera Fría.wav', data: wav() });
    expect(path).toBe('assets/audio/gotera_fria.wav');
    expect(project.resolveAsset(path)).toMatch(/^blob:/);
    expect(project.assets.get(path)).toMatchObject({ origin: 'author', status: 'ready', title: 'Gotera Fría.wav', bytes: 8 });
    expect(project.dirty).toBe(true);
  });

  it('ocupa el lugar de un recurso que faltaba, aunque tenga otro formato', async () => {
    const project = await opened();
    const path = await project.addAsset({ name: 'mi-gotera.wav', data: wav() }, { replacePath: 'assets/audio/drip.ogg' });
    expect(path).toBe('assets/audio/drip.wav');
    expect(project.nodes[0]!.acoustic_events[0]!.asset).toBe('assets/audio/drip.wav');
    await expect(project.addAsset({ name: 'foto.png', data: wav() }, { replacePath: 'assets/audio/steps.ogg' })).rejects.toThrow('espera un sonido');
  });

  it('rechaza formatos desconocidos y archivos enormes', async () => {
    const project = await opened();
    await expect(project.addAsset({ name: 'guion.pdf', data: wav() })).rejects.toThrow('no es un sonido ni una imagen');
    await expect(project.addAsset({ name: 'x.wav', data: new Uint8Array(51 * 1024 * 1024) })).rejects.toThrow('pesa demasiado');
  });

  it('coloca recursos en la obra sin tocar el manifiesto a mano', async () => {
    const project = await opened();
    project.assignAsset('assets/images/q.png', { kind: 'portrait', characterId: 'sancho', mood: 'asustado' });
    project.assignAsset('assets/images/pasillo.png', { kind: 'illustration', nodeId: 'rejilla' });
    project.assignAsset('assets/images/sobre.png', { kind: 'item_icon', itemId: 'sobre_lacrado' });
    project.assignAsset('assets/audio/noche.wav', { kind: 'ambience' });
    project.assignAsset('assets/audio/pasos.wav', { kind: 'scene_sound', nodeId: 'rejilla', loop: true });
    project.assignAsset('assets/audio/pasos.wav', { kind: 'scene_sound', nodeId: 'rejilla' });
    project.assignAsset('assets/audio/voz.wav', { kind: 'narration', nodeId: 'rejilla' });
    const m = project.manifest;
    expect(m.character_registry.sancho!.sprites).toMatchObject({ neutral: 'assets/images/sancho.webp', asustado: 'assets/images/q.png' });
    expect(m.item_registry.sobre_lacrado!.icon).toBe('assets/images/sobre.png');
    expect(m.acoustic_environment.ambience_bed).toBe('assets/audio/noche.wav');
    const rejilla = m.nodes.find((n) => n.node_id === 'rejilla')!;
    expect(rejilla.illustration).toMatchObject({ asset: 'assets/images/pasillo.png', placement: 'header' });
    expect(rejilla.acoustic_events.map((e) => [e.event_id, e.loop, e.coordinates])).toEqual([
      ['pasos', true, { x: 0, y: 0, z: 2 }],
      ['pasos_2', false, { x: 0, y: 0, z: 2 }],
    ]);
    expect(rejilla.screenless_mode?.voice_over_asset).toBe('assets/audio/voz.wav');
    project.undo();
    expect(project.manifest.nodes.find((n) => n.node_id === 'rejilla')!.screenless_mode).toBeUndefined();
  });

  it('en el navegador, los archivos siguen ahí al volver a abrir la obra', async () => {
    const project = await opened(new BrowserStorage('obra-recursos'));
    const path = await project.addAsset({ name: 'viento.wav', data: wav() });
    await project.save();
    setActivePinia(createPinia());
    const again = useProjectStore();
    await again.openFromStorage(new BrowserStorage('obra-recursos'));
    expect(again.resolveAsset(path)).toMatch(/^blob:/);
    expect(again.assets.get(path)?.origin).toBe('author');
    await again.removeAsset(path);
    expect(again.resolveAsset(path)).toBe(path);
  });
});

describe('AssetsDialog', () => {
  it('muestra lo que falta, permite aportarlo y colocar recursos nuevos', async () => {
    const project = await opened();
    const wrapper = mount(AssetsDialog, { attachTo: document.body });
    await flushPromises();
    // En pruebas no hay servidor: todos los recursos referenciados figuran como pendientes.
    expect(wrapper.get('[data-testid="assets-missing"]').text()).toContain('drip.ogg');
    expect(wrapper.get('[data-testid="missing-drip.ogg"]').text()).toContain('Sonido «gotera» en El Pasillo');

    const provide = wrapper.get('[data-testid="missing-drip.ogg"] [data-testid="provide-input"]');
    Object.defineProperty(provide.element, 'files', { value: [new File([wav()], 'gotera.ogg')] });
    await provide.trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-testid="missing-drip.ogg"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="asset-drip.ogg"]').text()).toContain('tuyo');

    const input = wrapper.get('[data-testid="asset-input"]');
    Object.defineProperty(input.element, 'files', { value: [new File([wav()], 'Campanas.wav')] });
    await input.trigger('change');
    await flushPromises();
    // Un archivo nuevo abre directamente el formulario para colocarlo.
    expect(wrapper.find('[data-testid="assign-form"]').exists()).toBe(true);
    await wrapper.get('[data-testid="assign-node"]').setValue('final');
    await wrapper.get('[data-testid="assign-confirm"]').trigger('click');
    expect(project.nodes.find((n) => n.node_id === 'final')!.acoustic_events[0]!.asset).toBe('assets/audio/campanas.wav');
    expect(wrapper.get('[data-testid="assets-message"]').text()).toContain('radar');
    expect(wrapper.get('[data-testid="asset-campanas.wav"] [data-testid="asset-usages"]').text()).toContain('Sonido «campanas» en final');

    await wrapper.get('[data-testid="asset-campanas.wav"] [data-testid="asset-remove"]').trigger('click');
    expect(wrapper.text()).toContain('Se usa en la obra');
    await wrapper.get('[data-testid="asset-remove-confirm"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-campanas.wav"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('avisa si el archivo no es un sonido ni una imagen', async () => {
    await opened();
    const wrapper = mount(AssetsDialog, { attachTo: document.body });
    await flushPromises();
    const input = wrapper.get('[data-testid="asset-input"]');
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'guion.pdf')] });
    await input.trigger('change');
    await flushPromises();
    expect(wrapper.get('[data-testid="assets-error"]').text()).toContain('no es un sonido ni una imagen');
    wrapper.unmount();
  });
});
