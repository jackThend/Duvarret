import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { BrowserStorage, WorkLibrary } from '@/core/project';
import { useProjectStore } from '../stores/project';
import { friendlyError, useWorks } from './useWorks';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { parseManuscript } from '@/core/ingest/sceneParser';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

async function withOpenWork() {
  const project = useProjectStore();
  await project.createWork({ storage: new BrowserStorage('primera'), manifest: sampleManifest() });
  return project;
}

describe('useWorks', () => {
  it('crea una obra en blanco sin perder los cambios de la anterior', async () => {
    const project = await withOpenWork();
    project.updateTitle('inicio', 'Cambio sin guardar');
    const works = useWorks();
    expect(await works.createBlank({ title: 'Nueva', author: 'Elena' })).toBe(true);
    expect(project.manifest.metadata.title).toBe('Nueva');
    expect(project.nodes).toHaveLength(1);
    expect(project.dirty).toBe(false);
    // La anterior se guardó antes de cambiar.
    const saved = await new BrowserStorage('primera').load();
    expect(saved.manifest).toContain('Cambio sin guardar');
    expect(works.recents.value.map((e) => e.title)).toEqual(['Nueva', 'La Sombra del Molino']);
  });

  it('vuelve a una obra reciente', async () => {
    await withOpenWork();
    const works = useWorks();
    await works.createBlank({ title: 'Otra', author: '' });
    const first = works.recents.value.find((e) => e.location === 'primera')!;
    expect(await works.openRecent(first)).toBe(true);
    expect(useProjectStore().manifest.metadata.title).toBe('La Sombra del Molino');
    expect(works.isCurrent(first)).toBe(true);
  });

  it('importar un manuscrito crea una obra nueva y conserva la abierta', async () => {
    await withOpenWork();
    const works = useWorks();
    expect(await works.createFromManuscript(parseManuscript('Capítulo I\n\nHabía una vez.'), { title: 'Importada' })).toBe(true);
    expect(useProjectStore().manifest.metadata.title).toBe('Importada');
    expect(useProjectStore().meta.mode).toBe('exegesis');
    expect(works.recents.value.map((e) => e.title)).toContain('La Sombra del Molino');
  });

  it('elimina obras del dispositivo y las quita de la lista', async () => {
    await withOpenWork();
    const works = useWorks();
    await works.createBlank({ title: 'Otra', author: '' });
    const first = works.recents.value.find((e) => e.location === 'primera')!;
    await works.deleteFromDevice(first);
    expect((await new BrowserStorage('primera').load()).manifest).toBeNull();
    expect(new WorkLibrary().list().map((e) => e.location)).not.toContain('primera');
  });

  it('informa en lenguaje llano si la obra ya no está', async () => {
    const works = useWorks();
    expect(await works.openRecent({ kind: 'browser', location: 'no-existe', title: 'x', author: '', openedAt: '2026-01-01T00:00:00Z' })).toBe(false);
    expect(works.error.value).toBe('Esa carpeta no contiene una obra de Duvarret.');
    expect(friendlyError(new Error('ya existe una obra en /x'))).toContain('Ya hay una obra con ese nombre');
    expect(friendlyError(new Error('boom'))).toContain('No se pudo abrir la obra');
  });
});

describe('resolución de recursos', () => {
  it('prioriza recursos aportados, luego el disco y luego la base', async () => {
    const project = useProjectStore();
    await project.open({ manifest: sampleManifest(), assetBase: 'works/demo', withLore: false });
    expect(project.resolveAsset('assets/a.wav')).toBe('works/demo/assets/a.wav');
    expect(project.resolveAsset('https://x/y.ogg')).toBe('https://x/y.ogg');
    await project.open({ manifest: sampleManifest(), assetResolver: (p) => `asset://obra/${p}`, withLore: false });
    expect(project.resolveAsset('./assets/a.wav')).toBe('asset://obra/assets/a.wav');
    project.setAssetOverride('assets/a.wav', 'blob:nuevo');
    expect(project.resolveAsset('assets/a.wav')).toBe('blob:nuevo');
    project.setAssetOverride('assets/a.wav', null);
    expect(project.resolveAsset('assets/a.wav')).toBe('asset://obra/assets/a.wav');
  });
});
