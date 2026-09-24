import type { SqlDriver, SqlValue } from './driver';

/** ¿Se ejecuta dentro del shell nativo de Tauri? */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Driver nativo: SQLite embebido vía `tauri-plugin-sql` (con FTS5 y JSON1).
 * `path` es relativo a la carpeta del proyecto `.duvarret` (p. ej. `knowledge/lore_graph.db`).
 */
export async function createTauriDriver(absolutePath: string): Promise<SqlDriver> {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  const db = await Database.load(`sqlite:${absolutePath}`);
  return {
    name: 'tauri-sqlite',
    async execute(sql: string, params: SqlValue[] = []) {
      const result = await db.execute(sql, params);
      return { rowsAffected: result.rowsAffected };
    },
    async select<T>(sql: string, params: SqlValue[] = []) {
      return db.select<T[]>(sql, params);
    },
    async close() {
      await db.close();
    },
  };
}
