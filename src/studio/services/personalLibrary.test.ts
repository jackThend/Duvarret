import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { PersonalLibrary, searchResources, type LibraryBackend } from './personalLibrary';
vi.stubGlobal('crypto', webcrypto);
afterEach(() => vi.restoreAllMocks());
const image = { name: 'Lámpara.svg', data: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>') };
function fixture() {
  let index: string | null = null;
  const files = new Map<string, Uint8Array>();
  const backend: LibraryBackend = { readIndex: async () => index, writeIndex: async text => { index = text; }, put: async (path, bytes) => { files.set(path, bytes.slice()); }, read: async path => files.get(path)!.slice(), remove: async path => { files.delete(path); }, url: async path => `blob:${path}` };
  return { library: new PersonalLibrary(async () => backend), files, backend };
}
it('deduplica importaciones concurrentes y conserva procedencia, perfil y etiquetas tras reabrir', async () => {
  const { library, backend, files } = fixture();
  const [a, b] = await Promise.all([library.add(image, { license: 'CC0', author: 'Elena' }), library.add({ ...image, name: 'Otra.svg' })]);
  expect(a!.id).toBe(b!.id); expect(files.size).toBe(1);
  await library.saveProfile({ name: 'Elena', autoCollect: true });
  await library.update(a!.id, { name: 'Lámpara', tags: ['habitación', 'noche', 'noche'] });
  const catalog = await new PersonalLibrary(async () => backend).load();
  expect(catalog.profile.name).toBe('Elena'); expect(catalog.resources[0]!.tags).toEqual(['habitación', 'noche']);
  expect(searchResources(catalog.resources, 'lampara habitacion cc0 elena', 'image')).toHaveLength(1);
  expect(searchResources(catalog.resources, 'lampara', 'audio')).toHaveLength(0);
});
it('la papelera permite restaurar; el borrado definitivo no toca copias de otras obras', async () => {
  const { library, files } = fixture(), resource = (await library.add(image))!;
  const independentCopy = await library.read(resource);
  await expect(library.purge(resource.id)).rejects.toThrow('papelera');
  await library.update(resource.id, { trashedAt: new Date().toISOString() });
  expect(searchResources((await library.load()).resources, '')).toHaveLength(0);
  await library.update(resource.id, { trashedAt: null });
  expect(searchResources((await library.load()).resources, '')).toHaveLength(1);
  await library.update(resource.id, { trashedAt: new Date().toISOString() });
  await library.purge(resource.id);
  expect(files.size).toBe(0); expect(independentCopy).toEqual(image.data);
});
it('respeta desactivar la recopilación automática sin impedir añadir manualmente', async () => {
  const { library, files } = fixture();
  await library.saveProfile({ name: '', autoCollect: false });
  expect(await library.add(image, undefined, true)).toBeNull(); expect(files.size).toBe(0);
  await library.add(image); expect(files.size).toBe(1);
});
it('un fallo de escritura no publica un catálogo nuevo y permite reintentar sin perder el anterior', async () => {
  const { library, backend } = fixture(); await library.saveProfile({ name: 'Antes', autoCollect: true });
  const write = vi.spyOn(backend, 'writeIndex').mockRejectedValueOnce(new Error('Disco lleno'));
  await expect(library.saveProfile({ name: 'Después', autoCollect: false })).rejects.toThrow('Disco lleno');
  expect((await library.load()).profile.name).toBe('Antes');
  write.mockRestore(); await library.saveProfile({ name: 'Después', autoCollect: false });
  expect((await library.load()).profile.name).toBe('Después');
});
it('rechaza catálogos dañados y archivos inválidos sin sobrescribir lo existente', async () => {
  const { library, backend } = fixture();
  const write = vi.spyOn(backend, 'writeIndex');
  await expect(library.add({ name: 'roto.wav', data: new Uint8Array([1, 2]) })).rejects.toThrow();
  vi.spyOn(backend, 'readIndex').mockResolvedValue('{roto');
  await expect(library.saveProfile({ name: 'No', autoCollect: true })).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
});
