import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { MemoryStorage } from '@/core/project';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import SettingsDialog from './SettingsDialog.vue';

beforeEach(async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  await useProjectStore().open({ manifest: sampleManifest(), storage: new MemoryStorage(), withLore: false });
});

describe('Preferencias: probar conexión', () => {
  it('prueba el director local sin tocar la obra', async () => {
    const project = useProjectStore();
    const before = JSON.stringify(project.manifest);
    const w = mount(SettingsDialog);
    await w.get('[data-testid="probe-provider"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="probe-result"]').text()).toContain('El co-director funciona con este proveedor.');
    expect(w.findAll('[data-testid="probe-check"]')).toHaveLength(4);
    expect(JSON.stringify(project.manifest)).toBe(before);
    expect(project.dirty).toBe(false);
  });

  it('muestra por qué falla un proveedor sin servicio y olvida el resultado al cambiar de proveedor', async () => {
    const studio = useStudioStore();
    studio.provider = { kind: 'ollama', baseUrl: 'http://127.0.0.1:9' };
    const w = mount(SettingsDialog);
    await w.get('[data-testid="probe-provider"]').trigger('click');
    await flushPromises();
    await vi.waitFor(() => expect(w.find('[data-testid="probe-result"]').exists()).toBe(true));
    expect(w.get('[data-testid="probe-result"]').text()).toContain('No se encuentra Ollama en http://127.0.0.1:9');
    await w.get('[data-testid="provider-kind"]').setValue('local');
    expect(w.find('[data-testid="probe-result"]').exists()).toBe(false);
  });
});
