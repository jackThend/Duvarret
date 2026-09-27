import { describe, expect, it } from 'vitest';
import { MAX_RECENT_WORKS, WorkLibrary, joinPath, newBrowserLocation, workFolderName, type KeyValueStore } from './workLibrary';

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('WorkLibrary', () => {
  it('ordena por apertura, sin duplicados', () => {
    const lib = new WorkLibrary(memory());
    lib.touch({ kind: 'browser', location: 'a', title: 'A', author: '', openedAt: '2026-01-01T00:00:00Z' });
    lib.touch({ kind: 'tauri', location: '/obras/B.duvarret', title: 'B', author: 'Elena', openedAt: '2026-01-02T00:00:00Z' });
    lib.touch({ kind: 'browser', location: 'a', title: 'A (renombrada)', author: '', openedAt: '2026-01-03T00:00:00Z' });
    expect(lib.list().map((e) => e.title)).toEqual(['A (renombrada)', 'B']);
    expect(lib.mostRecent()?.location).toBe('a');
  });

  it('distingue obras del navegador y carpetas con el mismo nombre', () => {
    const lib = new WorkLibrary(memory());
    lib.touch({ kind: 'browser', location: 'x', title: '1', author: '' });
    lib.touch({ kind: 'tauri', location: 'x', title: '2', author: '' });
    expect(lib.list()).toHaveLength(2);
    lib.remove('tauri', 'x');
    expect(lib.list().map((e) => e.title)).toEqual(['1']);
  });

  it('limita la lista y tolera datos dañados o sin almacenamiento', () => {
    const store = memory();
    const lib = new WorkLibrary(store);
    for (let i = 0; i < MAX_RECENT_WORKS + 5; i++) lib.touch({ kind: 'browser', location: `o${i}`, title: `${i}`, author: '', openedAt: new Date(2026, 0, 1, 0, i).toISOString() });
    expect(lib.list()).toHaveLength(MAX_RECENT_WORKS);
    store.data.set('duvarret:obras-recientes', '{roto');
    expect(lib.list()).toEqual([]);
    store.data.set('duvarret:obras-recientes', JSON.stringify([{ kind: 'nube', location: 'x' }, { kind: 'browser', location: 'ok', openedAt: '2026-01-01T00:00:00Z' }]));
    expect(lib.list().map((e) => e.location)).toEqual(['ok']);
    expect(new WorkLibrary(null).list()).toEqual([]);
  });
});

describe('nombres y rutas', () => {
  it('genera nombres de carpeta seguros', () => {
    expect(workFolderName('El Corazón Delator')).toBe('El_Corazon_Delator.duvarret');
    expect(workFolderName('¿¡ !?')).toBe('Obra.duvarret');
    expect(workFolderName('../../etc/passwd')).toBe('etcpasswd.duvarret');
  });

  it('une rutas de Unix y Windows', () => {
    expect(joinPath('/home/elena/', 'Obra.duvarret')).toBe('/home/elena/Obra.duvarret');
    expect(joinPath('C:\\Users\\Elena', 'Obra.duvarret')).toBe('C:\\Users\\Elena\\Obra.duvarret');
  });

  it('identificadores únicos para obras del dispositivo', () => {
    expect(newBrowserLocation(0)).not.toBe(newBrowserLocation(0));
    expect(newBrowserLocation()).toMatch(/^obra-/);
  });
});
