import { ref } from 'vue';
import { createMeta, WorkLibrary, type ProjectMeta, type WorkEntry } from '@/core/project';
import { deletePersonalWork } from '../services/desktop';
import { personalLibrary } from '../services/personalLibrary';
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

  const all = ref<WorkEntry[]>(new WorkLibrary().list(true));
  const refresh = () => { recents.value = recentWorks(); all.value = new WorkLibrary().list(true); };

  async function switchTo(load: () => Promise<boolean>) {
    error.value = '';
    busy.value = true;
    try {
      if (project.dirty || project.savingCount) await project.save();
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
  const createBlank = (options: { title: string; author: string; chooseFolder?: boolean }) =>
    switchTo(async () => {
      const meta: ProjectMeta = createMeta({ title: options.title || 'Obra sin título', author: options.author, mode: 'taller' });
      return withTarget(await prepareNewWork(meta, options.chooseFolder), (t) =>
        project.createWork({ storage: t.storage, manifest: blankManifest(meta.title, meta.author), meta, assetResolver: t.assetResolver }),
      );
    });

  /** Obra nueva a partir de un manuscrito importado. */
  const createFromManuscript = (parsed: ParsedManuscript, options: { title: string; author?: string }) =>
    switchTo(async () => {
      const author = options.author ?? (await personalLibrary.load()).profile.name;
      const meta = createMeta({ title: options.title, author, mode: 'exegesis' });
      return withTarget(await prepareNewWork(meta), (t) =>
        project.importManuscript(parsed, { title: options.title, author, storage: t.storage, assetResolver: t.assetResolver }),
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
    catalogAction(() => forgetWork(entry));
  }

  async function deleteFromDevice(entry: WorkEntry) {
    if (isCurrent(entry) || !new WorkLibrary().list(true).find(e => e.kind === entry.kind && e.location === entry.location)?.trashedAt) {
      error.value = 'Envía primero la obra cerrada a la papelera.'; return false;
    }
    busy.value = true; error.value = '';
    try {
      if (entry.kind === 'browser') await deleteBrowserWork(entry.location);
      else { await deletePersonalWork(entry.location); forgetWork(entry); }
      return true;
    } catch { error.value = 'No se pudo borrar. Las obras externas conservan sus archivos; puedes quitar su referencia de la biblioteca.'; return false; }
    finally { busy.value = false; refresh(); }
  }

  function catalogAction(action: () => void) { error.value = ''; try { action(); refresh(); } catch { error.value = 'No se pudo actualizar Mis obras. Tus archivos se conservan.'; } }
  function trash(entry: WorkEntry) { if (!isCurrent(entry)) catalogAction(() => new WorkLibrary().trash(entry)); }
  function restore(entry: WorkEntry) { catalogAction(() => new WorkLibrary().restore(entry)); }

  const isCurrent = (entry: WorkEntry) => project.storage.kind === entry.kind && project.storage.location === entry.location;

  return { busy, error, recents, all, refresh, createBlank, createFromManuscript, openRecent, openFolder, forget, trash, restore, deleteFromDevice, isCurrent };
}
