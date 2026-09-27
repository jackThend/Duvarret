/**
 * Dónde vive cada obra y cómo se abre:
 *  - Escritorio: una carpeta `.duvarret` que la autora elige en su disco.
 *  - Navegador: un espacio propio en el almacenamiento del dispositivo.
 */
import { BrowserStorage, TauriStorage, WorkLibrary, newBrowserLocation, type ProjectMeta, type ProjectStorage, type WorkEntry } from '@/core/project';
import type { StoryManifestInput } from '@/core/manifest';
import { allowWorkAssets, createWorkFolder, fileUrlResolver, isTauri, pickFolder } from './desktop';
import { FLAGSHIP_BASE } from './works';

export interface WorkTarget {
  storage: ProjectStorage;
  assetResolver: ((path: string) => string) | null;
  assetBase?: string;
}

/** Espacio del navegador que usaban las versiones anteriores (parte de la obra de ejemplo). */
export const LEGACY_SLOT = 'obra-actual';
const LAST_PARENT_KEY = 'duvarret:ultima-carpeta';

function lastParent(): string | undefined {
  try {
    return localStorage.getItem(LAST_PARENT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function rememberParent(dir: string) {
  try {
    localStorage.setItem(LAST_PARENT_KEY, dir);
  } catch {
    /* sin almacenamiento local */
  }
}

async function desktopTarget(root: string): Promise<WorkTarget> {
  await allowWorkAssets(root);
  return { storage: new TauriStorage(root), assetResolver: await fileUrlResolver(root) };
}

/** Prepara el lugar de una obra nueva. En el escritorio pregunta la carpeta; `null` si se cancela. */
export async function prepareNewWork(meta: ProjectMeta): Promise<WorkTarget | null> {
  if (!isTauri()) return { storage: new BrowserStorage(newBrowserLocation()), assetResolver: null };
  const parent = await pickFolder('¿En qué carpeta guardamos la obra?', lastParent());
  if (!parent) return null;
  rememberParent(parent);
  return desktopTarget(await createWorkFolder(parent, meta));
}

/** Abre una carpeta `.duvarret` existente (solo escritorio). `null` si se cancela. */
export async function pickExistingWork(): Promise<WorkTarget | null> {
  const root = await pickFolder('Elige la carpeta de la obra (.duvarret)', lastParent());
  return root ? desktopTarget(root) : null;
}

/** Lugar de una obra reciente. */
export async function targetFor(entry: Pick<WorkEntry, 'kind' | 'location'>): Promise<WorkTarget> {
  if (entry.kind === 'tauri') return desktopTarget(entry.location);
  return { storage: new BrowserStorage(entry.location), assetResolver: null, ...(entry.location === LEGACY_SLOT ? { assetBase: FLAGSHIP_BASE } : {}) };
}

/** Obra en blanco para el modo Taller. */
export function blankManifest(title: string, author: string): StoryManifestInput {
  return {
    metadata: { title: title || 'Obra sin título', author: author || 'Autoría desconocida', language: 'es-ES' },
    nodes: [{ node_id: 'escena_001', chapter_id: 'cap_01', title: 'Primera escena', text_payload: '', navigation: { is_ending: true } }],
  };
}

export function recentWorks(): WorkEntry[] {
  return new WorkLibrary().list();
}

export function forgetWork(entry: Pick<WorkEntry, 'kind' | 'location'>) {
  new WorkLibrary().remove(entry.kind, entry.location);
}

/** Borra del dispositivo una obra del navegador (las carpetas del disco nunca se borran desde aquí). */
export async function deleteBrowserWork(location: string) {
  await new BrowserStorage(location).remove();
  forgetWork({ kind: 'browser', location });
}
