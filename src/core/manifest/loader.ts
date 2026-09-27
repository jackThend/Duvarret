/** Carga de manifiestos desde texto, objeto o URL, con validación e integridad. */
import { checkIntegrity } from './integrity';
import type { ManifestIssue } from './diagnostics';
import { validateManifest, validateManifestText, type ValidationResult } from './validator';

export interface LoadResult extends ValidationResult {
  integrity: ManifestIssue[];
}

export type ManifestSource = string | URL | Record<string, unknown>;

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

function withIntegrity(result: ValidationResult): LoadResult {
  return { ...result, integrity: checkIntegrity(result.manifest) };
}

/** Carga síncrona desde texto JSON o un objeto ya deserializado. */
export function loadManifestSync(source: string | Record<string, unknown>): LoadResult {
  return withIntegrity(typeof source === 'string' ? validateManifestText(source) : validateManifest(source));
}

/** Carga desde texto, objeto o URL (relativa o absoluta). Nunca lanza. */
export async function loadManifest(source: ManifestSource, fetcher: Fetcher = globalThis.fetch?.bind(globalThis)): Promise<LoadResult> {
  if (source instanceof URL || (typeof source === 'string' && !source.trimStart().startsWith('{'))) {
    const url = source.toString();
    try {
      const response = await fetcher(url);
      if (!response.ok) throw new Error(String(response.status));
      return loadManifestSync(await response.text());
    } catch {
      const result = loadManifestSync({});
      result.issues.unshift({
        severity: 'error',
        path: '',
        code: 'not_found',
        message: 'No se encontró el archivo de la obra; se abrió una obra vacía.',
      });
      return result;
    }
  }
  return loadManifestSync(source);
}
