import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BrowserAssetStore, MemoryAssetStore, assetStoreFor } from './assetStore';
import { BrowserStorage, MemoryStorage, TauriStorage } from '@/core/project';

describe('almacenes de recursos', () => {
  it('elige el almacén según dónde vive la obra', () => {
    expect(assetStoreFor(new BrowserStorage('x'))).toBeInstanceOf(BrowserAssetStore);
    expect(assetStoreFor(new MemoryStorage())).toBeInstanceOf(MemoryAssetStore);
    expect(assetStoreFor(new TauriStorage('/obra')).constructor.name).toBe('DesktopAssetStore');
  });

  it('el navegador guarda archivos por obra en IndexedDB', async () => {
    const a = new BrowserAssetStore('obra-a');
    const b = new BrowserAssetStore('obra-b');
    expect(await a.put('assets/audio/x.wav', new Uint8Array([1, 2, 3]))).toMatch(/^blob:/);
    await b.put('assets/audio/y.wav', new Uint8Array([4]));
    expect([...(await a.urls()).keys()]).toEqual(['assets/audio/x.wav']);
    await a.remove('assets/audio/x.wav');
    expect((await a.urls()).size).toBe(0);
    await b.clear();
    expect((await b.urls()).size).toBe(0);
  });
});
