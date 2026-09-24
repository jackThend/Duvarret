import { welcomeManifest } from '../demo';

export interface BundledWork {
  manifest: unknown;
  assetBase: string;
}

/** Obra con la que abre el Studio la primera vez. */
export async function defaultWork(): Promise<BundledWork> {
  return { manifest: welcomeManifest(), assetBase: '' };
}
