import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { validateManifest } from '@/core/manifest';
import { MemoryStorage } from '@/core/project';
import { useProjectStore } from '../stores/project';
import { useAiStore } from '../stores/ai';
import VisualSceneDialog from './VisualSceneDialog.vue';
import VisualImagePicker from './VisualImagePicker.vue';
import { VisualStyleSchema } from '@/core/visual/style';

const service = vi.hoisted(() => ({ credentialStatus: vi.fn(), generateImage: vi.fn() }));
vi.mock('../services/ai', () => service);
const wrappers: ReturnType<typeof mount>[] = [];
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC1lEQVR42mP8/x8AAwMCAO+a0N8AAAAASUVORK5CYII='), c => c.charCodeAt(0));
beforeEach(async () => {
  localStorage.clear(); vi.clearAllMocks(); setActivePinia(createPinia());
  service.credentialStatus.mockResolvedValue({ configured: true });
  await useProjectStore().open({ manifest: validateManifest({ metadata: { title: 'Prueba' }, nodes: [{ node_id: 'inicio', navigation: { is_ending: true } }] }).manifest, storage: new MemoryStorage(), withLore: false });
});
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); });

describe('autoría visual', () => {
  it.each(['illustration', 'portrait', 'item', 'puzzle'] as const)('coloca una imagen por código en %s conservando el mecanismo', async mode => {
    const project = useProjectStore();
    if (mode === 'puzzle') project.patchNode('inicio', { gameplay_overlay: { type: 'lockpick', parameters: { pin_heights: [1, 2, 3] }, on_success: { grant_flags: ['abierta'] } } });
    const w = mount(VisualSceneDialog); wrappers.push(w);
    await w.get('[data-testid="visual-mode"]').setValue(mode);
    if (mode === 'portrait') await w.get('[data-testid="visual-character-name"]').setValue('La guardiana');
    const role = mode === 'item' ? 'object' : mode;
    await w.get(`[data-testid="visual-source-${role}"]`).setValue('code');
    await w.get(`[data-testid="visual-code-${role}"]`).trigger('click'); await flushPromises();
    await w.get(`[data-testid="visual-accept-${role}"]`).trigger('click');
    await vi.waitFor(() => expect(w.find(`[data-testid="visual-selected-${role}"]`).exists()).toBe(true));
    await w.get('[data-testid="visual-apply"]').trigger('click');
    await vi.waitFor(() => expect(w.get('[data-testid="visual-saved"]').text()).toContain('guardados'));
    if (mode === 'illustration') expect(project.selectedNode?.illustration?.asset).toMatch(/\.svg$/);
    if (mode === 'portrait') {
      expect(project.characters[0]?.name).toBe('La guardiana');
      expect(project.characters[0]?.sprites.neutral).toMatch(/\.svg$/);
      await w.get('[data-testid="visual-apply"]').trigger('click'); await flushPromises();
      expect(project.characters).toHaveLength(1);
    }
    if (mode === 'item') { expect(project.items[0]?.icon).toMatch(/\.svg$/); expect(project.manifest.initial_state.inventory).toEqual([]); }
    if (mode === 'puzzle') expect(project.selectedNode?.gameplay_overlay).toMatchObject({ type: 'lockpick', parameters: { pin_heights: [1, 2, 3], artwork: expect.stringMatching(/\.svg$/) }, on_success: { grant_flags: ['abierta'] } });
  });
  it('prepara por código, guarda una composición y puede deshacerla en un paso', async () => {
    const project = useProjectStore(), w = mount(VisualSceneDialog); wrappers.push(w);
    await w.get('[data-testid="visual-mode"]').setValue('room');
    await w.get('[data-testid="visual-description"]').setValue('Una cocina sin llave');
    await w.get('[data-testid="visual-item-name"]').setValue('Llave de cobre');
    for (const role of ['background', 'object']) {
      await w.get(`[data-testid="visual-source-${role}"]`).setValue('code');
      await w.get(`[data-testid="visual-code-${role}"]`).trigger('click'); await flushPromises();
      expect(w.find(`[data-testid="visual-candidate-${role}"]`).exists()).toBe(true);
      expect(project.selectedNode?.gameplay_overlay).toBeUndefined();
      await w.get(`[data-testid="visual-accept-${role}"]`).trigger('click');
      await vi.waitFor(() => expect(w.find(`[data-testid="visual-selected-${role}"]`).exists()).toBe(true));
    }
    await w.get('[data-testid="visual-style"]').setValue('comic');
    await w.get('[data-testid="visual-apply"]').trigger('click');
    await vi.waitFor(() => expect(w.get('[data-testid="visual-saved"]').text()).toContain('Escena guardada'));
    expect(project.selectedNode?.gameplay_overlay?.parameters.image).toMatch(/\.svg$/);
    const item = project.selectedNode!.gameplay_overlay!.on_success.grant_items[0]!;
    expect(project.manifest.item_registry[item]?.icon).toBe(project.selectedNode!.gameplay_overlay!.parameters.item_image);
    expect(project.manifest.global_settings.visual_style?.style).toBe('comic');
    expect((await project.storage.load())?.manifest).toBeDefined();
    project.undo(); expect(project.selectedNode?.gameplay_overlay).toBeUndefined();
    expect(project.manifest.item_registry[item]).toBeUndefined();
  });
  it.each(['gemini', 'cloudflare'] as const)('previsualiza %s y no guarda lo rechazado', async provider => {
    const project = useProjectStore();
    useAiStore().selectImage(provider);
    service.generateImage.mockResolvedValue({ data: png, mimeType: 'image/png', provider, model: 'prueba' });
    const w = mount(VisualImagePicker, { props: { modelValue: '', role: 'object', label: 'Llave', description: 'Llave de cobre', profile: VisualStyleSchema.parse({ style: 'comic', atmosphere: 'horror' }) } }); wrappers.push(w);
    await w.get('[data-testid="visual-source-object"]').setValue('cloud');
    await w.get('[data-testid="visual-generate-object"]').trigger('click');
    await vi.waitFor(() => expect(w.find('[data-testid="visual-candidate-object"]').exists()).toBe(true));
    expect(project.assetPaths.size).toBe(0);
    expect(service.generateImage).toHaveBeenCalledWith(expect.objectContaining({ provider, prompt: expect.stringContaining('Cómic') }));
    expect(service.generateImage.mock.calls[0]![0].prompt).toContain('fondo liso blanco');
    await w.get('[data-testid="visual-source-object"]').setValue('work');
    expect(w.find('[data-testid="visual-candidate-object"]').exists()).toBe(false);
    expect(project.assetPaths.size).toBe(0);
  });
  it('rechaza un resultado tardío de otra obra', async () => {
    let finish!: (v: unknown) => void;
    service.generateImage.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const w = mount(VisualImagePicker, { props: { modelValue: '', role: 'background', label: 'Fondo', description: 'Bosque', profile: VisualStyleSchema.parse({}) } }); wrappers.push(w);
    await w.get('[data-testid="visual-source-background"]').setValue('cloud');
    await w.get('[data-testid="visual-generate-background"]').trigger('click'); await flushPromises();
    await useProjectStore().open({ manifest: validateManifest({ metadata: { title: 'Otra' }, nodes: [{ node_id: 'otro' }] }).manifest, storage: new MemoryStorage(), withLore: false });
    finish({ data: png, mimeType: 'image/png', provider: 'gemini', model: 'prueba' });
    await vi.waitFor(() => expect(w.get('[data-testid="visual-error-background"]').text()).toContain('obra cambió'));
    expect(w.find('[data-testid="visual-candidate-background"]').exists()).toBe(false);
    expect(useProjectStore().assetPaths.size).toBe(0);
  });
});
