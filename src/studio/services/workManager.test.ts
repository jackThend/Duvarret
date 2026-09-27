import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMeta } from '@/core/project';

const desktop = vi.hoisted(() => ({
  tauri: false,
  pickFolder: vi.fn<(title: string, defaultPath?: string) => Promise<string | null>>(),
  createWorkFolder: vi.fn(async (parent: string) => `${parent}/Mi_obra.duvarret`),
  allowWorkAssets: vi.fn(async () => undefined),
  fileUrlResolver: vi.fn(async (root: string) => (p: string) => `asset://localhost/${root}/${p}`),
}));

vi.mock('./desktop', () => ({
  isTauri: () => desktop.tauri,
  pickFolder: desktop.pickFolder,
  createWorkFolder: desktop.createWorkFolder,
  allowWorkAssets: desktop.allowWorkAssets,
  fileUrlResolver: desktop.fileUrlResolver,
}));

import { LEGACY_SLOT, blankManifest, pickExistingWork, prepareNewWork, targetFor } from './workManager';

describe('workManager', () => {
  beforeEach(() => {
    desktop.tauri = false;
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('en el navegador, cada obra nueva tiene su propio espacio', async () => {
    const a = await prepareNewWork(createMeta({ title: 'A' }));
    const b = await prepareNewWork(createMeta({ title: 'B' }));
    expect(a?.storage.kind).toBe('browser');
    expect(a?.storage.location).not.toBe(b?.storage.location);
    expect(desktop.pickFolder).not.toHaveBeenCalled();
  });

  it('en el escritorio pregunta la carpeta, crea la obra y autoriza sus recursos', async () => {
    desktop.tauri = true;
    desktop.pickFolder.mockResolvedValueOnce('/home/elena/Obras');
    const meta = createMeta({ title: 'Mi obra' });
    const target = await prepareNewWork(meta);
    expect(desktop.createWorkFolder).toHaveBeenCalledWith('/home/elena/Obras', meta);
    expect(desktop.allowWorkAssets).toHaveBeenCalledWith('/home/elena/Obras/Mi_obra.duvarret');
    expect(target?.storage).toMatchObject({ kind: 'tauri', location: '/home/elena/Obras/Mi_obra.duvarret' });
    expect(target?.assetResolver?.('assets/a.wav')).toBe('asset://localhost//home/elena/Obras/Mi_obra.duvarret/assets/a.wav');
    // La siguiente vez propone la misma carpeta.
    desktop.pickFolder.mockResolvedValueOnce(null);
    expect(await prepareNewWork(meta)).toBeNull();
    expect(desktop.pickFolder).toHaveBeenLastCalledWith(expect.any(String), '/home/elena/Obras');
  });

  it('abre carpetas existentes y obras recientes', async () => {
    desktop.tauri = true;
    desktop.pickFolder.mockResolvedValueOnce('/obras/B.duvarret');
    expect((await pickExistingWork())?.storage.location).toBe('/obras/B.duvarret');
    expect((await targetFor({ kind: 'tauri', location: '/obras/C.duvarret' })).storage.kind).toBe('tauri');
    expect(desktop.allowWorkAssets).toHaveBeenCalledWith('/obras/C.duvarret');
  });

  it('el espacio antiguo conserva los recursos de la obra de ejemplo', async () => {
    expect((await targetFor({ kind: 'browser', location: LEGACY_SLOT })).assetBase).toContain('el-corazon-delator');
    expect((await targetFor({ kind: 'browser', location: 'obra-x' })).assetBase).toBeUndefined();
  });

  it('una obra en blanco tiene una primera escena lista para escribir', () => {
    const m = blankManifest('', '');
    expect(m.metadata?.title).toBe('Obra sin título');
    expect(m.nodes).toHaveLength(1);
  });
});
