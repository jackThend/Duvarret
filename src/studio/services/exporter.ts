/** Exportación a un clic desde el Studio, sin herramientas externas. */
import { compileBundle, workSlug, zipBundle, type CompileResult, type ExportTarget, type FileMap } from '@/core/compiler';
import type { StoryManifest } from '@/core/manifest';
import { isTauri } from '@/core/lore/tauriDriver';

export type Fetcher = (url: string) => Promise<Response>;

/** Carga el runtime del reproductor empaquetado junto al Studio (`./player/`). */
export async function loadPlayerRuntime(fetcher: Fetcher = fetch, base = './player'): Promise<FileMap> {
  const listing = await fetcher(`${base}/files.json`);
  if (!listing.ok) throw new Error('Esta instalación no incluye el reproductor para exportar.');
  const files = (await listing.json()) as string[];
  const runtime: FileMap = new Map();
  await Promise.all(
    files.map(async (file) => {
      const response = await fetcher(`${base}/${file}`);
      if (response.ok) runtime.set(file, new Uint8Array(await response.arrayBuffer()));
    }),
  );
  return runtime;
}

export async function compileFromStudio(options: { manifest: StoryManifest; assetBase: string; target: ExportTarget; fetcher?: Fetcher; runtime?: FileMap }): Promise<CompileResult> {
  const fetcher = options.fetcher ?? fetch;
  const runtime = options.runtime ?? (await loadPlayerRuntime(fetcher));
  const base = options.assetBase.replace(/\/$/, '');
  return compileBundle(
    {
      manifest: options.manifest,
      runtime,
      readAsset: async (path) => {
        try {
          const response = await fetcher(base ? `${base}/${path}` : path);
          return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
        } catch {
          return null;
        }
      },
    },
    options.target,
  );
}

export function download(name: string, data: Uint8Array, mime = 'application/zip') {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface SaveResult {
  location: string;
}

/** Guarda el resultado: descarga en el navegador; carpeta `export/` del proyecto en el escritorio. */
export async function saveExport(result: CompileResult, projectRoot: string | null): Promise<SaveResult> {
  const slug = workSlug(result.manifest);
  const label = result.target === 'audio_drama' ? 'audio-drama' : result.target;
  const name = `${slug}-${label}.zip`;
  const zip = zipBundle(result.files, slug);
  if (isTauri() && projectRoot) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('project_write_bytes', { root: projectRoot, relative: `export/${name}`, contents: Array.from(zip) });
    return { location: `export/${name}` };
  }
  download(name, zip);
  return { location: name };
}

/** Ejecutable portátil (solo escritorio): reproductor de Duvarret + carpeta `obra/`. */
export async function savePortable(result: CompileResult, projectRoot: string): Promise<SaveResult> {
  const { invoke } = await import('@tauri-apps/api/core');
  const slug = workSlug(result.manifest);
  const dir = `export/${slug}-escritorio`;
  for (const [path, data] of result.files) {
    if (!path.startsWith('manifest/') && !path.startsWith('assets/')) continue;
    await invoke('project_write_bytes', { root: projectRoot, relative: `${dir}/obra/${path}`, contents: Array.from(data) });
  }
  const binary = await invoke<string>('export_player_binary', { root: projectRoot, relativeDir: dir, name: slug });
  return { location: binary };
}
