import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { validateManifest } from '@/core/manifest';
import { MemoryStorage } from '@/core/project';
import { useProjectStore } from './project';

describe('aceptar propuestas con parámetros reactivos', () => {
  it('permite seguir editando sin conservar proxies dentro del manifiesto', async () => {
    setActivePinia(createPinia());
    const project = useProjectStore();
    const manifest = validateManifest({ metadata: { title: 'La cerradura' }, nodes: [{ node_id: 'inicio', text_payload: 'Una cerradura espera.', gameplay_overlay: { type: 'lockpick', parameters: { pin_heights: [1, 3, 2] } } }] }).manifest;
    await project.open({ manifest, storage: new MemoryStorage(), withLore: false });
    project.applyDraft(reactive(manifest));
    expect(() => project.updateText('inicio', 'La cerradura se abre.')).not.toThrow();
    expect(project.manifest.nodes[0]?.gameplay_overlay?.parameters.pin_heights).toEqual([1, 3, 2]);
    expect(project.manifest.nodes[0]?.text_payload).toBe('La cerradura se abre.');
    expect(() => structuredClone(project.manifest)).not.toThrow();
  });
});
