import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { SqlDriver, SqlValue } from './driver';

let sqlPromise: Promise<SqlJsStatic> | null = null;

export interface SqlJsOptions {
  /** Contenido previo de `lore_graph.db`. */
  data?: Uint8Array | null;
  /** Localiza el binario WASM (en el navegador se pasa la URL empaquetada por Vite). */
  locateFile?: (file: string) => string;
}

/** Driver SQLite en WebAssembly: funciona en navegador, PWA y pruebas headless. */
export async function createSqlJsDriver(options: SqlJsOptions = {}): Promise<SqlDriver> {
  sqlPromise ??= initSqlJs(options.locateFile ? { locateFile: options.locateFile } : undefined);
  const SQL = await sqlPromise;
  const db: Database = options.data ? new SQL.Database(options.data) : new SQL.Database();

  return {
    name: 'sql.js',
    async execute(sql: string, params: SqlValue[] = []) {
      if (params.length) db.run(sql, params);
      else db.exec(sql);
      return { rowsAffected: db.getRowsModified() };
    },
    async select<T>(sql: string, params: SqlValue[] = []) {
      const stmt = db.prepare(sql);
      try {
        if (params.length) stmt.bind(params);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally {
        stmt.free();
      }
    },
    exportBytes: () => db.export(),
    async close() {
      db.close();
    },
  };
}
