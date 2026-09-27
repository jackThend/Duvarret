import type { SqlDriver } from '@/core/lore/driver';
import { createSqlJsDriver } from '@/core/lore/sqljsDriver';

/**
 * Abre el motor SQLite del lore. En el navegador y en Tauri se usa SQLite-WASM en memoria y la
 * base se persiste como `knowledge/lore_graph.db` al guardar (portátil y versionable).
 */
export async function openLoreDriver(bytes: Uint8Array | null): Promise<SqlDriver> {
  if (import.meta.env.MODE === 'test' || typeof window === 'undefined') return createSqlJsDriver({ data: bytes });
  const { default: wasmUrl } = await import('sql.js/dist/sql-wasm.wasm?url');
  return createSqlJsDriver({ data: bytes, locateFile: () => wasmUrl });
}
