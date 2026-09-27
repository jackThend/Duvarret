import { ref } from 'vue';
import { createMeta, type ProjectMeta, type WorkEntry } from '@/core/project';
import type { ParsedManuscript } from '@/core/ingest/sceneParser';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import { blankManifest, deleteBrowserWork, forgetWork, pickExistingWork, prepareNewWork, recentWorks, targetFor, type WorkTarget } from '../services/workManager';

/** Traduce los errores técnicos a lenguaje llano. */
export function friendlyError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/ya existe una obra/i.test(text)) return 'Ya hay una obra con ese nombre en esa carpeta. Elige otro título u otra carpeta.';
  if (/no es un proyecto|No se encontró la obra/i.test(text)) return 'Esa carpeta no contiene una obra de Duvarret.';
  if (/espacio/i.test(text)) return text;
  return 'No se pudo abrir la obra. Comprueba que la carpeta sigue en su sitio.';
}

/** Abrir, crear y cambiar de obra sin perder cambios: la obra actual se guarda antes. */
export function useWorks() {
  const project = useProjectStore();
  const studio = useStudioStore();
  const busy = ref(false);
  const error = ref('');
  const recents = ref<WorkEntry[]>(recentWorks());

  const refresh = () => (recents.value = recentWorks());

  async function switchTo(load: () => Promise<boolean>) {
    error.value = '';
    busy.value = true;
    try {
      if (project.dirty) await project.save();
      const done = await load();
      if (done) {
        studio.reset();
        studio.refreshPitches();
      }
      return done;
    } catch (e) {
      error.value = friendlyError(e);
      return false;
    } finally {
      busy.value = false;
      refresh();
    }
  }

  const withTarget = async (target: WorkTarget | null, open: (t: WorkTarget) => Promise<void>) => {
    if (!target) return false;
    await open(target);
    return true;
  };

  /** Obra en blanco (modo Taller). */
  const createBlank = (options: { title: string; author: string }) =>
    switchTo(async () => {
      const meta: ProjectMeta = createMeta({ title: options.title || 'Obra sin título', author: options.author, mode: 'taller' });
      return withTarget(await prepareNewWork(meta), (t) =>
        project.createWork({ storage: t.storage, manifest: blankManifest(meta.title, meta.author), meta, assetResolver: t.assetResolver }),
      );
    });

  /** Obra nueva a partir de un manuscrito importado. */
  const createFromManuscript = (parsed: ParsedManuscript, options: { title: string; author?: string }) =>
    switchTo(async () => {
      const meta = createMeta({ title: options.title, author: options.author ?? '', mode: 'exegesis' });
      return withTarget(await prepareNewWork(meta), (t) =>
        project.importManuscript(parsed, { title: options.title, ...(options.author ? { author: options.author } : {}), storage: t.storage, assetResolver: t.assetResolver }),
      );
    });

  const openRecent = (entry: WorkEntry) =>
    switchTo(async () => {
      const target = await targetFor(entry);
      await project.openFromStorage(target.storage, { assetResolver: target.assetResolver, ...(target.assetBase ? { assetBase: target.assetBase } : {}) });
      return true;
    });

  const openFolder = () =>
    switchTo(async () =>
      withTarget(await pickExistingWork(), (t) => project.openFromStorage(t.storage, { assetResolver: t.assetResolver })),
    );

  function forget(entry: WorkEntry) {
    forgetWork(entry);
    refresh();
  }

  async function deleteFromDevice(entry: WorkEntry) {
    if (entry.kind !== 'browser') return;
    await deleteBrowserWork(entry.location);
    refresh();
  }

  const isCurrent = (entry: WorkEntry) => project.storage.kind === entry.kind && project.storage.location === entry.location;

  return { busy, error, recents, refresh, createBlank, createFromManuscript, openRecent, openFolder, forget, deleteFromDevice, isCurrent };
}
