/** Biblioteca personal independiente de las obras; cada uso copia sus bytes al proyecto. */
import { z } from 'zod';
import { AssetRecordSchema, type AssetRecord } from '@/core/assets/registry';
import { checkAssetContent } from '@/core/assets/content';
import { MAX_ASSET_BYTES, mimeFor } from '@/core/assets/usages';
import { BrowserAssetStore, DesktopAssetStore } from './assetStore';
import { isTauri, fileUrlResolver } from './desktop';

export const ProfileSchema = z.object({ name: z.string().max(120).default(''), autoCollect: z.boolean().default(true) });
const ResourceSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/), name: z.string(), path: z.string().regex(/^assets\/[a-f0-9]{64}\.[a-z0-9]+$/),
  kind: z.enum(['audio', 'image']), bytes: z.number().nonnegative(),
  tags: z.array(z.string()).default([]), createdAt: z.string(), trashedAt: z.string().optional(),
  provenance: AssetRecordSchema.partial().optional(),
});
const CatalogSchema = z.object({ version: z.literal(1), profile: ProfileSchema, resources: z.array(ResourceSchema) });
export type LocalProfile = z.output<typeof ProfileSchema>;
export type PersonalResource = z.output<typeof ResourceSchema>;
export type PersonalCatalog = z.output<typeof CatalogSchema>;
export interface LibraryBackend {
  readIndex(): Promise<string | null>; writeIndex(text: string): Promise<void>;
  read(path: string): Promise<Uint8Array>; put(path: string, data: Uint8Array): Promise<unknown>;
  remove(path: string): Promise<void>; url(path: string): Promise<string>;
}
const EMPTY = (): PersonalCatalog => ({ version: 1, profile: { name: '', autoCollect: true }, resources: [] });
const KEY = 'duvarret:biblioteca-personal-v1';

async function nativeInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}
export async function personalPaths() { return nativeInvoke<{ resources: string; works: string }>('studio_library_paths'); }
export async function readWorkResource(project: { storage: { kind: string; location: string }; resolveAsset(path: string): string }, path: string) {
  if (project.storage.kind === 'tauri') return new Uint8Array(await nativeInvoke<number[]>('project_read_bytes', { root: project.storage.location, relative: path }));
  const response = await fetch(project.resolveAsset(path));
  if (!response.ok) throw new Error('No se pudo leer el recurso de la obra.');
  return new Uint8Array(await response.arrayBuffer());
}
async function backend(): Promise<LibraryBackend> {
  if (isTauri()) {
    const { resources: root } = await personalPaths();
    const store = new DesktopAssetStore(root), resolver = await fileUrlResolver(root);
    return {
      readIndex: () => nativeInvoke<string>('project_read_text', { root, relative: 'catalogo.json' }).catch(async error => {
        // Ausencia inicial; otros errores no deben ocultar un catálogo existente.
        if (/not find|no se encuentra|os error 2|cannot find/i.test(String(error))) return null;
        throw error;
      }),
      writeIndex: contents => nativeInvoke('project_write_text', { root, relative: 'catalogo.json', contents }),
      read: async relative => new Uint8Array(await nativeInvoke<number[]>('project_read_bytes', { root, relative })),
      put: (path, data) => store.put(path, data), remove: path => store.remove(path), url: async path => resolver(path),
    };
  }
  const store = new BrowserAssetStore('__biblioteca-personal-v1__');
  return {
    readIndex: async () => localStorage.getItem(KEY), writeIndex: async text => { localStorage.setItem(KEY, text); },
    read: path => store.read(path), put: (path, data) => store.put(path, data), remove: path => store.remove(path),
    // Los SVG requieren su MIME explícito para que el navegador pueda representarlos.
    url: async path => URL.createObjectURL(new Blob([(await store.read(path)).slice().buffer], { type: mimeFor(path) })),
  };
}

export class PersonalLibrary {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: () => Promise<LibraryBackend> = backend) {}
  private ready?: Promise<LibraryBackend>;
  private get backend() { return this.ready ??= this.storage().catch(e => { this.ready = undefined; throw e; }); }
  async load(): Promise<PersonalCatalog> {
    const raw = await (await this.backend).readIndex();
    if (!raw) return EMPTY();
    const result = CatalogSchema.safeParse(JSON.parse(raw));
    if (!result.success) throw new Error('No se pudo leer tu biblioteca. Sus archivos se conservan; no se ha sobrescrito el catálogo.');
    return result.data;
  }
  private change<T>(run: (catalog: PersonalCatalog, storage: LibraryBackend) => Promise<T>) {
    const next = this.queue.catch(() => {}).then(async () => {
      const storage = await this.backend, catalog = await this.load();
      const value = await run(catalog, storage);
      await storage.writeIndex(JSON.stringify(CatalogSchema.parse(catalog)));
      return value;
    });
    this.queue = next;
    return next;
  }
  saveProfile(profile: LocalProfile) { return this.change(async catalog => { catalog.profile = ProfileSchema.parse(profile); }); }
  async add(file: { name: string; data: Uint8Array }, provenance?: Partial<AssetRecord>, automatic = false) {
    if (file.data.byteLength > MAX_ASSET_BYTES) throw new Error('El recurso supera el máximo de 50 MB.');
    const content = checkAssetContent(file.name, file.data);
    if (!content.ok) throw new Error(content.reason);
    const id = [...new Uint8Array(await crypto.subtle.digest('SHA-256', file.data.slice().buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
    return this.change(async (catalog, storage) => {
      if (automatic && !catalog.profile.autoCollect) return null;
      const previous = catalog.resources.find(r => r.id === id);
      if (previous) { if (!automatic) delete previous.trashedAt; if (provenance) previous.provenance = { ...previous.provenance, ...provenance }; return previous; }
      const path = `assets/${id}.${content.name.split('.').pop()!.toLowerCase()}`;
      await storage.put(path, file.data);
      const resource: PersonalResource = { id, name: file.name, path, bytes: file.data.byteLength, kind: provenance?.kind === 'image' || /\.(png|jpe?g|svg|webp|gif|avif)$/i.test(content.name) ? 'image' : 'audio', tags: [], createdAt: new Date().toISOString(), ...(provenance ? { provenance } : {}) };
      catalog.resources.unshift(resource);
      return resource;
    });
  }
  update(id: string, fields: { name?: string; tags?: string[]; trashedAt?: string | null }) {
    return this.change(async catalog => {
      const resource = catalog.resources.find(r => r.id === id);
      if (!resource) throw new Error('El recurso ya no está en la biblioteca.');
      if (fields.name !== undefined) resource.name = fields.name.trim() || resource.name;
      if (fields.tags) resource.tags = [...new Set(fields.tags.map(s => s.trim()).filter(Boolean))];
      if (fields.trashedAt === null) delete resource.trashedAt;
      else if (fields.trashedAt) resource.trashedAt = fields.trashedAt;
    });
  }
  purge(id: string) {
    return this.change(async (catalog, storage) => {
      const resource = catalog.resources.find(r => r.id === id);
      if (!resource?.trashedAt) throw new Error('Envía primero el recurso a la papelera.');
      // Elimina solo la copia personal; nunca las copias independientes en las obras.
      await storage.remove(resource.path);
      catalog.resources = catalog.resources.filter(r => r.id !== id);
    });
  }
  async read(resource: PersonalResource) { return (await this.backend).read(resource.path); }
  async url(resource: PersonalResource) { return (await this.backend).url(resource.path); }
}
export const personalLibrary = new PersonalLibrary();

export function searchResources(resources: PersonalResource[], query: string, kind = 'all', trash = false) {
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return resources.filter(r => Boolean(r.trashedAt) === trash && (kind === 'all' || r.kind === kind)
    && words.every(word => normalize([r.name, ...r.tags, r.provenance?.author, r.provenance?.license, r.provenance?.provider, r.provenance?.prompt].join(' ')).includes(word)));
}
