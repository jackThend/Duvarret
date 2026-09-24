import { AssetRegistry } from '@/core/assets/registry';
import { welcomeManifest } from '../demo';

export interface BundledWork {
  manifest: unknown;
  assetBase: string;
  lore: Uint8Array | null;
  assets: AssetRegistry;
}

export const FLAGSHIP_BASE = './works/el-corazon-delator.duvarret';

function welcome(): BundledWork {
  return { manifest: welcomeManifest(), assetBase: '', lore: null, assets: new AssetRegistry() };
}

/**
 * Obra con la que abre el Studio la primera vez: la obra insignia «El Corazón Delator».
 * `?obra=bienvenida` abre en su lugar la obra mínima de bienvenida.
 */
export async function defaultWork(): Promise<BundledWork> {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return welcome();
  if (new URLSearchParams(window.location.search).get('obra') === 'bienvenida') return welcome();
  try {
    const [manifest, lore, registry] = await Promise.all([
      fetch(`${FLAGSHIP_BASE}/manifest/story_manifest.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      fetch(`${FLAGSHIP_BASE}/knowledge/lore_graph.db`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
      fetch(`${FLAGSHIP_BASE}/assets/registry.json`).then((r) => (r.ok ? r.text() : null)).catch(() => null),
    ]);
    return {
      manifest: manifest as unknown,
      assetBase: FLAGSHIP_BASE,
      lore: lore ? new Uint8Array(lore) : null,
      assets: registry ? AssetRegistry.fromJson(registry) : new AssetRegistry(),
    };
  } catch {
    return welcome();
  }
}
