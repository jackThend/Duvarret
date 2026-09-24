/**
 * Abstracción mínima de SQL embebido. Las consultas usan parámetros `$1, $2…` en orden de
 * aparición, compatibles con sql.js (web / pruebas) y con el plugin SQL de Tauri (nativo).
 */
export type SqlValue = string | number | null;

export interface SqlDriver {
  readonly name: string;
  execute(sql: string, params?: SqlValue[]): Promise<{ rowsAffected: number }>;
  select<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Serializa la base completa (para guardar `lore_graph.db` o exportarla). */
  exportBytes?(): Uint8Array;
  close(): Promise<void>;
}
