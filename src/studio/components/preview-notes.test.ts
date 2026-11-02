import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { MemoryStorage } from '@/core/project';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { useStoryStore } from '@/runtime/stores/story';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import LivePreview from './LivePreview.vue';

beforeEach(async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  await useProjectStore().open({ manifest: sampleManifest(), storage: new MemoryStorage(), withLore: false });
});

const missing = (id: string, label: string) => ['Falta el sonido «' + label + '»; oyes un tono de prueba.', { kind: 'missing_asset' as const, id, asset: `assets/audio/${label}.ogg`, label }] as const;

describe('avisos del motor de audio en la vista previa', () => {
  it('muestra la nota de la escena que se lee, sin repetirla, y deja aportar el sonido', async () => {
    const studio = useStudioStore();
    const story = useStoryStore();
    story.load(useProjectStore().manifest);
    story.start('inicio');
    const w = mount(LivePreview, { global: { stubs: { RuntimePlayer: true, AcousticRadar: true } } });
    studio.notePreviewAudio(...missing('inicio::gotera', 'gotera'));
    studio.notePreviewAudio(...missing('inicio::gotera', 'gotera'));
    studio.notePreviewAudio(...missing('final::campana', 'campana'));
    studio.notePreviewAudio('El motor de salas envolventes no está disponible.');
    await nextTick();
    expect(w.findAll('[data-testid="preview-audio-note"]').map((n) => n.text())).toEqual(['Falta el sonido «gotera»; oyes un tono de prueba.']);
    await w.get('[data-testid="preview-audio-provide"]').trigger('click');
    expect(studio.assetsOpen).toBe(true);
    // Una vista previa nueva (tras aportar el archivo) vuelve a empezar sin notas viejas.
    studio.previewNonce++;
    await nextTick();
    expect(w.find('[data-testid="preview-audio-notes"]').exists()).toBe(false);
    w.unmount();
  });
});
