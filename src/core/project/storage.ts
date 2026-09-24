/**
 * Persistencia del proyecto. Dentro de Tauri escribe la carpeta `.duvarret` en disco;
 * en el navegador usa el almacenamiento local del dispositivo (nunca la nube).
 */
import { PROJECT_PATHS } from './project';

export interface ProjectFiles {
  meta: string | null;
  manifest: string | null;
  assets: string | null;
  lore: Uint8Array | null;
}

export interface ProjectStorage {
  readonly kind: 'memory' | 'browser' | 'tauri';
  readonly location: string;
  load(): Promise<ProjectFiles>;
  save(files: Partial<ProjectFiles>): Promise<void>;
}

export class MemoryStorage implements ProjectStorage {
  readonly kind = 'memory' as const;
  files: ProjectFiles = { meta: null, manifest: null, assets: null, lore: null };
  constructor(readonly location = 'memoria') {}
  async load() {
    return { ...this.files };
  }
  async save(files: Partial<ProjectFiles>) {
    this.files = { ...this.files, ...files };
  }
}

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export class BrowserStorage implements ProjectStorage {
  readonly kind = 'browser' as const;
  constructor(readonly location: string) {}
  private key(part: string) {
    return `duvarret:${this.location}:${part}`;
  }
  async load(): Promise<ProjectFiles> {
    try {
      const lore = localStorage.getItem(this.key('lore'));
      return {
        meta: localStorage.getItem(this.key('meta')),
        manifest: localStorage.getItem(this.key('manifest')),
        assets: localStorage.getItem(this.key('assets')),
        lore: lore ? fromBase64(lore) : null,
      };
    } catch {
      return { meta: null, manifest: null, assets: null, lore: null };
    }
  }
  async save(files: Partial<ProjectFiles>) {
    try {
      if (files.meta != null) localStorage.setItem(this.key('meta'), files.meta);
      if (files.manifest != null) localStorage.setItem(this.key('manifest'), files.manifest);
      if (files.assets != null) localStorage.setItem(this.key('assets'), files.assets);
      if (files.lore != null) localStorage.setItem(this.key('lore'), toBase64(files.lore));
    } catch {
      throw new Error('No queda espacio en este dispositivo para guardar la obra.');
    }
  }
}

/** Carpeta `.duvarret` en disco mediante los comandos seguros del shell nativo. */
export class TauriStorage implements ProjectStorage {
  readonly kind = 'tauri' as const;
  constructor(readonly location: string) {}
  private async invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  }
  async load(): Promise<ProjectFiles> {
    const bundle = await this.invoke<{ project_json: string; manifest_json: string | null }>('project_read', { root: this.location });
    const assets = await this.invoke<string>('project_read_text', { root: this.location, relative: PROJECT_PATHS.assets }).catch(() => null);
    const lore = await this.invoke<number[]>('project_read_bytes', { root: this.location, relative: PROJECT_PATHS.lore }).catch(() => null);
    return { meta: bundle.project_json, manifest: bundle.manifest_json, assets, lore: lore ? Uint8Array.from(lore) : null };
  }
  async save(files: Partial<ProjectFiles>) {
    const write = (relative: string, contents: string) => this.invoke('project_write_text', { root: this.location, relative, contents });
    if (files.meta != null) await write(PROJECT_PATHS.meta, files.meta);
    if (files.manifest != null) await write(PROJECT_PATHS.manifest, files.manifest);
    if (files.assets != null) await write(PROJECT_PATHS.assets, files.assets);
    if (files.lore != null) await this.invoke('project_write_bytes', { root: this.location, relative: PROJECT_PATHS.lore, contents: Array.from(files.lore) });
  }
}
