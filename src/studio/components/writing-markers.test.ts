import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { validateManifest } from '@/core/manifest';
import { MemoryStorage } from '@/core/project';
import { DirectorOrchestrator, LocalDirectorProvider } from '@/core/agent';
import { useProjectStore } from '../stores/project';
import WritingCanvas from './WritingCanvas.vue';

const manifest = () => validateManifest({
  metadata: { title: 'Marcas' },
  nodes: [{ node_id: 'tiro', title: 'El tiro', text_payload: 'Alguien disparó dos veces.', navigation: { is_ending: true },
    acoustic_events: [{ event_id: 'viento', asset: 'assets/audio/viento.wav' }] }],
}).manifest;

beforeEach(async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  await useProjectStore().open({ manifest: manifest(), storage: new MemoryStorage(), withLore: false });
});

describe('marcas de sonido en el lienzo', () => {
  it('insertar una marca tras la palabra elegida la pinta como ficha y deja elegir sonido y retardo', async () => {
    const project = useProjectStore();
    const w = mount(WritingCanvas, { attachTo: document.body });
    const prose = w.get('[data-testid="prose"]').element as HTMLTextAreaElement;
    prose.setSelectionRange(8, 15); // «disparó»
    await w.get('[data-testid="insert-sound-marker"]').trigger('click');
    await nextTick();
    expect(project.nodes[0]!.text_payload).toBe('Alguien disparó⟦disparó⟧ dos veces.');
    expect(w.get('[data-testid="sound-chip"]').text()).toBe('⟦disparó⟧');
    expect(w.get('[data-testid="word-count"]').text()).toContain('4 palabras');

    await w.get('[data-testid="sound-marker-asset"]').setValue('assets/audio/viento.wav');
    await w.get('[data-testid="sound-marker-delay"]').setValue(1.5);
    await w.get('[data-testid="sound-marker-form"]').trigger('submit');
    const event = project.nodes[0]!.acoustic_events.find((e) => e.trigger === 'on_text_marker')!;
    expect(event).toMatchObject({ asset: 'assets/audio/viento.wav', trigger_marker: 'disparó', delay_ms: 1500, label: 'disparó' });
    expect(w.get('[data-testid="sound-marker-disparó"]').text()).toContain('viento.wav · 1,5 s');
    expect(project.integrity.some((i) => i.code === 'missing_text_marker')).toBe(false);
    w.unmount();
  });

  it('el director coloca un sonido justo en una palabra sin tocar el resto de la prosa', async () => {
    const turn = await new DirectorOrchestrator({ provider: new LocalDirectorProvider() }).run({
      message: 'Pon un disparo a la derecha justo en «disparó»',
      manifest: useProjectStore().manifest,
      context: { nodeId: 'tiro' },
    });
    const node = turn.draft.nodes[0]!;
    expect(node.text_payload).toBe('Alguien disparó⟦disparó⟧ dos veces.');
    expect(node.acoustic_events.at(-1)).toMatchObject({ trigger: 'on_text_marker', trigger_marker: 'disparó', label: 'disparo' });
    expect(turn.executions.at(-1)!.outcome.summary).toContain('justo al leer «disparó»');
    const missing = await new DirectorOrchestrator({ provider: new LocalDirectorProvider() }).run({
      message: 'Pon un disparo justo en «trueno lejano»',
      manifest: useProjectStore().manifest,
      context: { nodeId: 'tiro' },
    });
    expect(missing.executions.at(-1)!.outcome.summary).toContain('no está en el texto de la escena');
    expect(missing.draft.nodes[0]!.text_payload).toBe('Alguien disparó dos veces.');
  });
});
