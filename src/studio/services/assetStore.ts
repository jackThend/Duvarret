/**
 * Almacén de los archivos de recursos de una obra:
 *  - Escritorio: la carpeta `assets/` del proyecto en disco.
 *  - Navegador: IndexedDB del dispositivo (localStorage no admite archivos de audio).
 *  - Memoria: pruebas y obras de ejemplo.
 */
import type { ProjectStorage } from '@/core/project';
import { mimeFor } from '@/core/assets/usages';

export interface AssetStore {
  /** Guarda un archivo y devuelve la URL con la que se reproduce, o `null` si la resuelve el propio proyecto. */
  put(path: string, data: Uint8Array): Promise<string | null>;
  remove(path: string): Promise<void>;
  /** URLs de los archivos guardados en el dispositivo (solo navegador y memoria). */
  urls(): Promise<Map<string, string>>;
  /** Borra todos los archivos de la obra (al eliminarla del dispositivo). */
  clear(): Promise<void>;
}

const blobUrl = (path: string, data: Uint8Array | Blob) =>
  URL.createObjectURL(data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeFor(path) }));

export class MemoryAssetStore implements AssetStore {
  readonly files = new Map<string, Uint8Array>();
  async put(path: string, data: Uint8Array) {
    this.files.set(path, data);
    return blobUrl(path, data);
  }
  async remove(path: string) {
    this.files.delete(path);
  }
  async urls() {
    return new Map([...this.files].map(([p, d]) => [p, blobUrl(p, d)]));
  }
  async clear() {
    this.files.clear();
  }
}

const DB_NAME = 'duvarret-recursos';
const STORE = 'archivos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no permite guardar archivos en el dispositivo.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacén de recursos.'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        let result: T | undefined;
        if (request) request.onsuccess = () => (result = request.result);
        transaction.oncomplete = () => {
          db.close();
          resolve(result);
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('No queda espacio en este dispositivo para el archivo.'));
      }),
  );
}

export class BrowserAssetStore implements AssetStore {
  constructor(private readonly location: string) {}
  private key(path: string) {
    return `${this.location}::${path}`;
  }
  async put(path: string, data: Uint8Array) {
    const blob = new Blob([data as BlobPart], { type: mimeFor(path) });
    await tx('readwrite', (s) => s.put(blob, this.key(path)));
    return blobUrl(path, blob);
  }
  async remove(path: string) {
    await tx('readwrite', (s) => s.delete(this.key(path)));
  }
  async urls() {
    const prefix = `${this.location}::`;
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
    const keys = ((await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys(range))) ?? []) as string[];
    const values = ((await tx<Blob[]>('readonly', (s) => s.getAll(range))) ?? []) as Blob[];
    return new Map(keys.map((k, i) => [k.slice(prefix.length), blobUrl(k.slice(prefix.length), values[i]!)]));
  }
  async clear() {
    const prefix = `${this.location}::`;
    await tx('readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, `${prefix}￿`)));
  }
}

export class DesktopAssetStore implements AssetStore {
  constructor(private readonly root: string) {}
  private async invoke<T>(cmd: string, args: Record<string, unknown>) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  }
  async put(path: string, data: Uint8Array) {
    await this.invoke('project_write_bytes', { root: this.root, relative: path, contents: Array.from(data) });
    return null; // el proyecto ya sabe servir sus archivos desde el disco
  }
  async remove(path: string) {
    await this.invoke('project_delete_asset', { root: this.root, relative: path });
  }
  async urls() {
    return new Map<string, string>();
  }
  async clear() {
    /* las carpetas del disco nunca se borran desde el Studio */
  }
}

export function assetStoreFor(storage: ProjectStorage): AssetStore {
  if (storage.kind === 'tauri') return new DesktopAssetStore(storage.location);
  if (storage.kind === 'browser') return new BrowserAssetStore(storage.location);
  return new MemoryAssetStore();
}
