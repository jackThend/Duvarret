/** Integración con el escritorio (Tauri): diálogos de carpeta, creación de obras y acceso a recursos. */
import { isTauri } from '@/core/lore/tauriDriver';
import { joinPath, workFolderName, type ProjectMeta } from '@/core/project';

export { isTauri };

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** Pide al autor una carpeta. Devuelve `null` si cancela. */
export async function pickFolder(title: string, defaultPath?: string): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({ directory: true, multiple: false, title, ...(defaultPath ? { defaultPath } : {}) });
  return typeof picked === 'string' ? picked : null;
}

/** Crea la carpeta `.duvarret` de una obra nueva dentro de `parent`. Nunca sobrescribe otra obra. */
export async function createWorkFolder(parent: string, meta: ProjectMeta): Promise<string> {
  const root = joinPath(parent, workFolderName(meta.title));
  await invoke('project_create', { root, projectJson: JSON.stringify(meta, null, 2) });
  return root;
}

/** Autoriza a la vista previa a leer los recursos de la carpeta de la obra. */
export async function allowWorkAssets(root: string): Promise<void> {
  await invoke('project_allow_assets', { root });
}

/** URL para que la vista previa cargue un archivo de la obra desde el disco. */
export async function fileUrlResolver(root: string): Promise<(path: string) => string> {
  const { convertFileSrc } = await import('@tauri-apps/api/core');
  return (path: string) => convertFileSrc(joinPath(root, path.replace(/^\.?\//, '')));
}
