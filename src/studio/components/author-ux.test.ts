import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { MemoryStorage } from '@/core/project';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { useProjectStore } from '../stores/project';
import { useAutosave } from '../composables/useAutosave';
import Modal from './Modal.vue';
import TopBar from './TopBar.vue';
import ExportPanel from './ExportPanel.vue';

const exporting = vi.hoisted(() => ({ compileFromStudio: vi.fn(), loadPlayerRuntime: vi.fn(), savePortableZip: vi.fn(), savePortable: vi.fn(), saveExport: vi.fn() }));
vi.mock('../services/exporter', () => exporting);
const wrappers: ReturnType<typeof mount>[] = [];
beforeEach(async () => {
  setActivePinia(createPinia());
  await useProjectStore().open({ manifest: sampleManifest(), storage: new MemoryStorage(), withLore: false });
  vi.clearAllMocks();
});
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('recorrido de autor sin conocimientos técnicos', () => {
  it('prepara solo los formatos elegidos y entrega archivos independientes', async () => {
    exporting.loadPlayerRuntime.mockResolvedValue(new Map());
    exporting.compileFromStudio.mockImplementation(async ({ target }) => ({ ok: true, target, missingAssets: [], blocking: [] }));
    exporting.saveExport.mockImplementation(async ({ target }) => ({ location: `cuento-${target}.zip` }));
    const wrapper = mount(ExportPanel); wrappers.push(wrapper);
    await wrapper.get('[data-testid="export-select-audio_drama"]').setValue(true);
    expect(wrapper.get('[data-testid="export-select-native"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="export-selected"]').trigger('click');
    await flushPromises();
    expect(exporting.compileFromStudio.mock.calls.map(([input]) => input.target)).toEqual(['web', 'audio_drama']);
    expect(exporting.saveExport).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-testid="export-next-steps"]').text()).toContain('cuento-web.zip');
    expect(wrapper.get('[data-testid="export-next-steps"]').text()).toContain('cuento-audio_drama.zip');
  });

  it('no permite descargar sin seleccionar un formato', async () => {
    const wrapper = mount(ExportPanel); wrappers.push(wrapper);
    await wrapper.get('[data-testid="export-select-web"]').setValue(false);
    expect(wrapper.get('[data-testid="export-selected"]').attributes('disabled')).toBeDefined();
  });
  it('guarda tras una pausa y mantiene visibles los cambios si el guardado falla', async () => {
    vi.useFakeTimers();
    const project = useProjectStore();
    const storage = project.storage as MemoryStorage;
    const save = vi.spyOn(storage, 'save').mockRejectedValueOnce(new Error('Disco lleno'));
    const wrapper = mount(defineComponent({ setup() { useAutosave(project); return () => h(TopBar); } }), { attachTo: document.body });
    wrappers.push(wrapper);
    project.updateText('inicio', 'Mi escena nueva.');
    await nextTick();
    await vi.advanceTimersByTimeAsync(1250);
    expect(project.dirty).toBe(true);
    expect(project.saveError).toContain('Tus cambios siguen abiertos');
    expect(wrapper.get('[data-testid="save-state"]').text()).toBe('No se ha guardado');
    save.mockRestore();
    await wrapper.get('[data-testid="save"]').trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    expect(project.dirty).toBe(false);
    expect(wrapper.get('[data-testid="save-state"]').text()).toBe('Todo guardado');
    expect(JSON.parse(storage.files.manifest!).nodes[0].text_payload).toBe('Mi escena nueva.');
  });

  it('mantiene el foco dentro del diálogo y lo devuelve al botón que lo abrió', async () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    const wrapper = mount(Modal, { props: { title: 'Prueba' }, slots: { default: '<input aria-label="Nombre" /><button data-testid="last">Terminar</button>' }, attachTo: document.body });
    wrappers.push(wrapper);
    await nextTick();
    const panel = wrapper.get('[role="dialog"]');
    await panel.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(wrapper.get('[data-testid="last"]').element);
    await wrapper.get('[data-testid="last"]').trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(wrapper.get('[data-testid="modal-close"]').element);
    wrapper.unmount(); wrappers.pop();
    expect(document.activeElement).toBe(trigger);
  });

  it('no publica recursos ausentes sin que el autor elija expresamente un borrador', async () => {
    exporting.compileFromStudio.mockResolvedValue({ ok: true, missingAssets: ['assets/images/falta.png'] });
    exporting.saveExport.mockResolvedValue({ location: 'cuento-web.zip' });
    const wrapper = mount(ExportPanel); wrappers.push(wrapper);
    await wrapper.get('[data-testid="export-web"]').trigger('click');
    await flushPromises();
    expect(exporting.saveExport).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="export-message"]').text()).toContain('Faltan sonidos o imágenes');
    await wrapper.get('[data-testid="export-allow-draft"]').setValue(true);
    await wrapper.get('[data-testid="export-web"]').trigger('click');
    await flushPromises();
    expect(exporting.saveExport).toHaveBeenCalledOnce();
    expect(wrapper.get('[data-testid="export-next-steps"]').text()).toContain('GitHub Pages');
  });

  it('no cierra un diálogo que está escribiendo la publicación', async () => {
    const wrapper = mount(Modal, { props: { title: 'Preparando', dismissible: false }, attachTo: document.body }); wrappers.push(wrapper);
    await nextTick();
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.get('[data-testid="modal-close"]').attributes('disabled')).toBeDefined();
  });
});
