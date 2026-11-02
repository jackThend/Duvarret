/** Exportación a un clic desde el Studio, sin herramientas externas. */
import { compileBundle, workSlug, zipBundle, type CompileResult, type ExportTarget, type FileMap } from '@/core/compiler';
import type { StoryManifest } from '@/core/manifest';
import { isTauri } from '@/core/lore/tauriDriver';
import { writeProjectBytes } from './nativeBytes';
import { zipSync, type Zippable } from 'fflate';

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

export async function compileFromStudio(options: {
  manifest: StoryManifest;
  /** URL de cada recurso de la obra (la misma que usa la vista previa). */
  resolveAsset: (path: string) => string;
  target: ExportTarget;
  fetcher?: Fetcher;
  runtime?: FileMap;
}): Promise<CompileResult> {
  const fetcher = options.fetcher ?? fetch;
  const runtime = options.runtime ?? (await loadPlayerRuntime(fetcher));
  return compileBundle(
    {
      manifest: options.manifest,
      runtime,
      readAsset: async (path) => {
        try {
          const response = await fetcher(options.resolveAsset(path));
          // Un servidor que responde con su página principal (HTML) no tiene el archivo.
          if (!response.ok || (response.headers.get('content-type') ?? '').includes('text/html')) return null;
          return new Uint8Array(await response.arrayBuffer());
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

/** Un paquete conserva todas las ramas y finales; no convierte cada desenlace en otra obra. */
export async function savePortableZip(result: CompileResult, projectRoot: string): Promise<SaveResult> {
  if (!result.ok || result.target !== 'native') throw new Error('La aplicación de escritorio aún no se puede preparar.');
  const slug = workSlug(result.manifest);
  const files: FileMap = new Map();
  for (const [path, bytes] of result.files) {
    if (!path.startsWith('manifest/') && !path.startsWith('assets/')) continue;
    files.set(`obra/${path}`, bytes);
  }
  if (!isTauri() || !projectRoot) throw new Error('La aplicación de escritorio se prepara desde Duvarret Studio de escritorio.');
  const { invoke } = await import('@tauri-apps/api/core');
  const dir = `export/${slug}-escritorio`;
  const binary = await invoke<string>('export_player_binary', { root: projectRoot, relativeDir: dir, name: slug });
  const nameOfBinary = binary.split(/[\\/]/).at(-1)!;
  const bytes = await invoke<number[]>('project_read_bytes', { root: projectRoot, relative: `${dir}/${nameOfBinary}` });
  files.set(nameOfBinary, new Uint8Array(bytes));
  files.set('LEEME.txt', new TextEncoder().encode('Conserva juntos el programa y la carpeta obra. Incluye todas las decisiones y finales. Aplicación para el sistema del equipo que la preparó.'));
  const name = `${slug}-escritorio.zip`;
  const entries: Zippable = {};
  for (const [path, data] of files) entries[`${slug}/${path}`] = path === nameOfBinary ? [data, { os: 3, attrs: 0o100755 << 16 }] : data;
  const zip = zipSync(entries, { level: 6 });
  await writeProjectBytes(projectRoot, `export/${name}`, zip, invoke);
  return { location: `export/${name}` };
}

/** Guarda el resultado: descarga en el navegador; carpeta `export/` del proyecto en el escritorio. */
export async function saveExport(result: CompileResult, projectRoot: string | null): Promise<SaveResult> {
  const slug = workSlug(result.manifest);
  const label = result.target === 'audio_drama' ? 'audio-drama' : result.target;
  const name = `${slug}-${label}.zip`;
  const zip = zipBundle(result.files, slug);
  if (isTauri() && projectRoot) {
    const { invoke } = await import('@tauri-apps/api/core');
    await writeProjectBytes(projectRoot, `export/${name}`, zip, invoke);
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
    await writeProjectBytes(projectRoot, `${dir}/obra/${path}`, data, invoke);
  }
  const binary = await invoke<string>('export_player_binary', { root: projectRoot, relativeDir: dir, name: slug });
  return { location: binary };
}
