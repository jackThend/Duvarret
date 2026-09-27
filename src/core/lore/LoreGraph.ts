/**
 * Cerebro semántico local (Graph RAG embebido) sobre SQLite — doc 02 §4.3, RF-03.
 *
 * Tablas: `nodes` (entidades), `edges` (aristas ponderadas con marca temporal), `events`
 * (causalidad temporal) y `flags`, más un índice de texto completo (FTS5, o FTS4 si el
 * motor no dispone de FTS5). Todo reside en `knowledge/lore_graph.db`, sin servicios externos.
 */
import type { SqlDriver, SqlValue } from './driver';
import {
  ENTITY_CATEGORIES,
  type EntityCategory,
  type EntityState,
  type EventAction,
  type JsonObject,
  type LoreEdge,
  type LoreEntity,
  type LoreEvent,
} from './types';

export const LORE_SCHEMA_VERSION = 1;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS nodes (
     id TEXT PRIMARY KEY,
     category TEXT NOT NULL CHECK (category IN (${ENTITY_CATEGORIES.map((c) => `'${c}'`).join(', ')})),
     name TEXT NOT NULL,
     attributes TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes)),
     status_flags TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(status_flags)),
     created_in_beat INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_nodes_category ON nodes(category)`,
  `CREATE TABLE IF NOT EXISTS edges (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
     target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
     relationship TEXT NOT NULL,
     weight REAL NOT NULL DEFAULT 1.0,
     timeline_timestamp INTEGER NOT NULL DEFAULT 0,
     properties TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(properties))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_node_id, relationship)`,
  `CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_node_id, relationship)`,
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     timestamp INTEGER NOT NULL,
     beat INTEGER NOT NULL DEFAULT 0,
     subject TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
     action TEXT NOT NULL,
     object TEXT REFERENCES nodes(id) ON DELETE SET NULL,
     location TEXT REFERENCES nodes(id) ON DELETE SET NULL,
     description TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE INDEX IF NOT EXISTS idx_events_subject ON events(subject, timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_events_object ON events(object, timestamp)`,
  `CREATE TABLE IF NOT EXISTS flags (
     name TEXT PRIMARY KEY,
     value TEXT NOT NULL DEFAULT 'true',
     set_in_beat INTEGER NOT NULL DEFAULT 0
   )`,
];

interface NodeRow {
  id: string;
  category: EntityCategory;
  name: string;
  attributes: string;
  status_flags: string;
  created_in_beat: number;
}

interface EdgeRow extends Omit<LoreEdge, 'properties'> {
  properties: string;
}

const parse = (text: string): JsonObject => {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
  } catch {
    return {};
  }
};

const toEntity = (row: NodeRow): LoreEntity => ({
  id: row.id,
  category: row.category,
  name: row.name,
  attributes: parse(row.attributes),
  status_flags: parse(row.status_flags),
  created_in_beat: Number(row.created_in_beat),
});

const toEdge = (row: EdgeRow): LoreEdge => ({
  ...row,
  id: Number(row.id),
  weight: Number(row.weight),
  timeline_timestamp: Number(row.timeline_timestamp),
  properties: parse(row.properties),
});

export interface EntityInput {
  id: string;
  category: EntityCategory;
  name: string;
  attributes?: JsonObject;
  status_flags?: JsonObject;
  created_in_beat?: number;
}

export interface EdgeInput {
  source: string;
  target: string;
  relationship: string;
  weight?: number;
  timestamp?: number;
  properties?: JsonObject;
}

export interface EventInput {
  timestamp: number;
  beat?: number;
  subject: string;
  action: EventAction;
  object?: string | null;
  location?: string | null;
  description?: string;
}

export interface Subgraph {
  nodes: LoreEntity[];
  edges: LoreEdge[];
}

export class LoreGraph {
  private constructor(
    readonly driver: SqlDriver,
    readonly fullText: 'fts5' | 'fts4' | 'none',
  ) {}

  /** Abre (o crea) el grafo y aplica las migraciones. */
  static async open(driver: SqlDriver): Promise<LoreGraph> {
    await driver.execute('PRAGMA foreign_keys = ON');
    for (const statement of SCHEMA) await driver.execute(statement);
    await driver.execute(`INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '${LORE_SCHEMA_VERSION}')`);

    let fullText: 'fts5' | 'fts4' | 'none' = 'none';
    for (const engine of ['fts5', 'fts4'] as const) {
      try {
        const options = engine === 'fts5' ? `tokenize = 'unicode61 remove_diacritics 2'` : `tokenize=unicode61 "remove_diacritics=2"`;
        await driver.execute(`CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING ${engine}(id, name, body, ${options})`);
        fullText = engine;
        break;
      } catch {
        /* se prueba el siguiente motor de texto completo */
      }
    }
    return new LoreGraph(driver, fullText);
  }

  private async tx<T>(fn: () => Promise<T>): Promise<T> {
    await this.driver.execute('BEGIN');
    try {
      const result = await fn();
      await this.driver.execute('COMMIT');
      return result;
    } catch (error) {
      await this.driver.execute('ROLLBACK');
      throw error;
    }
  }

  private async index(entity: LoreEntity) {
    if (this.fullText === 'none') return;
    const aliases = Array.isArray(entity.attributes.aliases) ? entity.attributes.aliases.join(' ') : '';
    const body = [aliases, typeof entity.attributes.description === 'string' ? entity.attributes.description : ''].join(' ');
    await this.driver.execute('DELETE FROM nodes_fts WHERE id = $1', [entity.id]);
    await this.driver.execute('INSERT INTO nodes_fts(id, name, body) VALUES ($1, $2, $3)', [entity.id, entity.name, body]);
  }

  // ── Entidades ────────────────────────────────────────────────────────────
  async upsertEntity(input: EntityInput): Promise<LoreEntity> {
    const entity: LoreEntity = {
      id: input.id,
      category: input.category,
      name: input.name,
      attributes: input.attributes ?? {},
      status_flags: input.status_flags ?? {},
      created_in_beat: input.created_in_beat ?? 0,
    };
    await this.driver.execute(
      `INSERT INTO nodes(id, category, name, attributes, status_flags, created_in_beat) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(id) DO UPDATE SET category = excluded.category, name = excluded.name, attributes = excluded.attributes,
       status_flags = excluded.status_flags, created_in_beat = excluded.created_in_beat`,
      [entity.id, entity.category, entity.name, JSON.stringify(entity.attributes), JSON.stringify(entity.status_flags), entity.created_in_beat],
    );
    await this.index(entity);
    return entity;
  }

  async upsertMany(inputs: EntityInput[]): Promise<void> {
    await this.tx(async () => {
      for (const input of inputs) await this.upsertEntity(input);
    });
  }

  async getEntity(id: string): Promise<LoreEntity | null> {
    const [row] = await this.driver.select<NodeRow>('SELECT * FROM nodes WHERE id = $1', [id]);
    return row ? toEntity(row) : null;
  }

  async listEntities(category?: EntityCategory): Promise<LoreEntity[]> {
    const rows = category
      ? await this.driver.select<NodeRow>('SELECT * FROM nodes WHERE category = $1 ORDER BY name', [category])
      : await this.driver.select<NodeRow>('SELECT * FROM nodes ORDER BY category, name');
    return rows.map(toEntity);
  }

  /** Fusiona atributos (y banderas de estado) en una entidad existente. */
  async updateEntity(id: string, patch: { attributes?: JsonObject; status_flags?: JsonObject; name?: string }): Promise<boolean> {
    const current = await this.getEntity(id);
    if (!current) return false;
    await this.upsertEntity({
      ...current,
      name: patch.name ?? current.name,
      attributes: { ...current.attributes, ...(patch.attributes ?? {}) },
      status_flags: { ...current.status_flags, ...(patch.status_flags ?? {}) },
    });
    return true;
  }

  /** Poda una entidad; sus aristas se eliminan en cascada (integridad referencial). */
  async removeEntity(id: string): Promise<boolean> {
    if (this.fullText !== 'none') await this.driver.execute('DELETE FROM nodes_fts WHERE id = $1', [id]);
    const { rowsAffected } = await this.driver.execute('DELETE FROM nodes WHERE id = $1', [id]);
    return rowsAffected > 0;
  }

  /** Búsqueda por nombre (texto completo, sin distinguir acentos). */
  async search(text: string, limit = 20): Promise<LoreEntity[]> {
    const terms = text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (!terms.length) return [];
    if (this.fullText !== 'none') {
      const query = terms.map((t) => `${t}*`).join(' ');
      const rows = await this.driver.select<NodeRow>(
        `SELECT nodes.* FROM nodes_fts JOIN nodes ON nodes.id = nodes_fts.id WHERE nodes_fts MATCH $1 LIMIT ${Math.floor(limit)}`,
        [query],
      );
      return rows.map(toEntity);
    }
    const rows = await this.driver.select<NodeRow>(`SELECT * FROM nodes WHERE name LIKE $1 LIMIT ${Math.floor(limit)}`, [`%${terms.join('%')}%`]);
    return rows.map(toEntity);
  }

  // ── Aristas ──────────────────────────────────────────────────────────────
  async addEdge(input: EdgeInput): Promise<number> {
    await this.driver.execute(
      `INSERT INTO edges(source_node_id, target_node_id, relationship, weight, timeline_timestamp, properties) VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.source, input.target, input.relationship, input.weight ?? 1, input.timestamp ?? 0, JSON.stringify(input.properties ?? {})],
    );
    const [row] = await this.driver.select<{ id: number }>('SELECT last_insert_rowid() AS id');
    return Number(row?.id ?? 0);
  }

  async addEdges(inputs: EdgeInput[]): Promise<void> {
    await this.tx(async () => {
      for (const input of inputs) await this.addEdge(input);
    });
  }

  async removeEdge(id: number): Promise<boolean> {
    const { rowsAffected } = await this.driver.execute('DELETE FROM edges WHERE id = $1', [id]);
    return rowsAffected > 0;
  }

  async edgesOf(id: string, options: { relationship?: string; direction?: 'out' | 'in' | 'both' } = {}): Promise<LoreEdge[]> {
    const direction = options.direction ?? 'both';
    const clauses: string[] = [];
    const params: SqlValue[] = [id];
    if (direction !== 'in') clauses.push('source_node_id = $1');
    if (direction !== 'out') clauses.push('target_node_id = $1');
    let sql = `SELECT * FROM edges WHERE (${clauses.join(' OR ')})`;
    if (options.relationship) {
      sql += ' AND relationship = $2';
      params.push(options.relationship);
    }
    sql += ' ORDER BY timeline_timestamp, id';
    return (await this.driver.select<EdgeRow>(sql, params)).map(toEdge);
  }

  /** Vecinos de una entidad con la arista que los une. */
  async neighbors(id: string, options: { relationship?: string; direction?: 'out' | 'in' | 'both' } = {}) {
    const edges = await this.edgesOf(id, options);
    const out: { entity: LoreEntity; edge: LoreEdge }[] = [];
    for (const edge of edges) {
      const other = edge.source_node_id === id ? edge.target_node_id : edge.source_node_id;
      const entity = await this.getEntity(other);
      if (entity) out.push({ entity, edge });
    }
    return out;
  }

  /** Consulta del agente: entidad por id o nombre y sus relaciones (`queryLoreGraph`). */
  async query(entity: string, relationship?: string): Promise<{ entity: LoreEntity; relations: { entity: LoreEntity; edge: LoreEdge }[] }[]> {
    const direct = await this.getEntity(entity);
    const matches = direct ? [direct] : await this.search(entity, 5);
    const results = [];
    for (const match of matches) {
      results.push({ entity: match, relations: await this.neighbors(match.id, relationship ? { relationship } : {}) });
    }
    return results;
  }

  // ── Eventos y línea temporal ────────────────────────────────────────────
  async recordEvent(input: EventInput): Promise<number> {
    await this.driver.execute(
      `INSERT INTO events(timestamp, beat, subject, action, object, location, description) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [input.timestamp, input.beat ?? Math.floor(input.timestamp / 1000), input.subject, input.action, input.object ?? null, input.location ?? null, input.description ?? ''],
    );
    const [row] = await this.driver.select<{ id: number }>('SELECT last_insert_rowid() AS id');
    return Number(row?.id ?? 0);
  }

  async recordEvents(inputs: EventInput[]): Promise<void> {
    await this.tx(async () => {
      for (const input of inputs) await this.recordEvent(input);
    });
  }

  async eventsFor(id: string, until = Number.MAX_SAFE_INTEGER): Promise<LoreEvent[]> {
    const rows = await this.driver.select<LoreEvent>(
      'SELECT * FROM events WHERE subject = $1 AND timestamp <= $2 ORDER BY timestamp, id',
      [id, until],
    );
    return rows.map((r) => ({ ...r, id: Number(r.id), timestamp: Number(r.timestamp), beat: Number(r.beat) }));
  }

  /** Estado derivado de una entidad en un instante de la historia (pliegue de eventos). */
  async stateAt(id: string, timestamp = Number.MAX_SAFE_INTEGER): Promise<EntityState> {
    const state: EntityState = { id, alive: true, intact: true, holder: null, location: null, lastEvent: null, terminalEvent: null };
    const entity = await this.getEntity(id);
    if (entity && typeof entity.attributes.location === 'string') state.location = entity.attributes.location;
    if (entity && typeof entity.attributes.holder === 'string') state.holder = entity.attributes.holder;
    for (const event of await this.eventsFor(id, timestamp)) {
      state.lastEvent = event;
      switch (event.action) {
        case 'dies':
          state.alive = false;
          state.terminalEvent = event;
          break;
        case 'revives':
          state.alive = true;
          state.terminalEvent = null;
          break;
        case 'destroyed':
        case 'consumed':
        case 'lost':
          state.intact = false;
          state.holder = null;
          state.terminalEvent = event;
          if (event.location) state.location = event.location;
          break;
        case 'repaired':
          state.intact = true;
          state.terminalEvent = null;
          break;
        case 'acquired':
        case 'given':
        case 'confiscated':
          state.holder = event.object;
          if (event.action !== 'confiscated') {
            state.intact = true;
            state.terminalEvent = null;
          }
          if (event.location) state.location = event.location;
          break;
        case 'moved_to':
        case 'appears':
          if (event.location) state.location = event.location;
          break;
      }
    }
    return state;
  }

  /** Objetos que posee un personaje en un instante dado (una sola consulta). */
  async inventoryOf(holder: string, timestamp = Number.MAX_SAFE_INTEGER): Promise<LoreEntity[]> {
    const items = await this.listEntities('item');
    const state = new Map(items.map((i) => [i.id, { holder: typeof i.attributes.holder === 'string' ? i.attributes.holder : null, intact: true }]));
    const rows = await this.driver.select<{ subject: string; action: EventAction; object: string | null }>(
      `SELECT e.subject, e.action, e.object FROM events e JOIN nodes n ON n.id = e.subject
       WHERE n.category = 'item' AND e.timestamp <= $1
       AND e.action IN ('acquired', 'given', 'confiscated', 'destroyed', 'consumed', 'lost', 'repaired')
       ORDER BY e.timestamp, e.id`,
      [timestamp],
    );
    for (const row of rows) {
      const s = state.get(row.subject);
      if (!s) continue;
      if (row.action === 'destroyed' || row.action === 'consumed' || row.action === 'lost') {
        s.intact = false;
        s.holder = null;
      } else if (row.action === 'repaired') s.intact = true;
      else {
        s.holder = row.object;
        if (row.action !== 'confiscated') s.intact = true;
      }
    }
    return items.filter((i) => state.get(i.id)?.holder === holder && state.get(i.id)?.intact);
  }

  // ── Banderas ─────────────────────────────────────────────────────────────
  async setFlag(name: string, value: string | boolean = true, beat = 0): Promise<void> {
    await this.driver.execute(
      `INSERT INTO flags(name, value, set_in_beat) VALUES ($1, $2, $3) ON CONFLICT(name) DO UPDATE SET value = excluded.value, set_in_beat = excluded.set_in_beat`,
      [name, String(value), beat],
    );
  }

  async clearFlag(name: string): Promise<void> {
    await this.driver.execute('DELETE FROM flags WHERE name = $1', [name]);
  }

  async flags(): Promise<Record<string, string>> {
    const rows = await this.driver.select<{ name: string; value: string }>('SELECT name, value FROM flags ORDER BY name');
    return Object.fromEntries(rows.map((r) => [r.name, r.value]));
  }

  // ── Visualización y métricas ────────────────────────────────────────────
  async subgraph(options: { center?: string; limit?: number } = {}): Promise<Subgraph> {
    const limit = Math.floor(options.limit ?? 300);
    if (options.center) {
      const center = await this.getEntity(options.center);
      if (!center) return { nodes: [], edges: [] };
      const relations = await this.neighbors(center.id);
      const nodes = new Map<string, LoreEntity>([[center.id, center]]);
      for (const r of relations) nodes.set(r.entity.id, r.entity);
      return { nodes: [...nodes.values()], edges: relations.map((r) => r.edge) };
    }
    const nodes = (await this.driver.select<NodeRow>(`SELECT * FROM nodes ORDER BY created_in_beat, id LIMIT ${limit}`)).map(toEntity);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (await this.driver.select<EdgeRow>('SELECT * FROM edges ORDER BY id'))
      .map(toEdge)
      .filter((e) => ids.has(e.source_node_id) && ids.has(e.target_node_id));
    return { nodes, edges };
  }

  async counts(): Promise<{ nodes: number; edges: number; events: number; byCategory: Record<string, number> }> {
    const [n] = await this.driver.select<{ c: number }>('SELECT COUNT(*) AS c FROM nodes');
    const [e] = await this.driver.select<{ c: number }>('SELECT COUNT(*) AS c FROM edges');
    const [v] = await this.driver.select<{ c: number }>('SELECT COUNT(*) AS c FROM events');
    const rows = await this.driver.select<{ category: string; c: number }>('SELECT category, COUNT(*) AS c FROM nodes GROUP BY category');
    return {
      nodes: Number(n?.c ?? 0),
      edges: Number(e?.c ?? 0),
      events: Number(v?.c ?? 0),
      byCategory: Object.fromEntries(rows.map((r) => [r.category, Number(r.c)])),
    };
  }

  /** Comprueba la integridad referencial (claves foráneas) de la base. */
  async integrityCheck(): Promise<{ ok: boolean; violations: number }> {
    const rows = await this.driver.select('PRAGMA foreign_key_check');
    return { ok: rows.length === 0, violations: rows.length };
  }

  exportBytes(): Uint8Array | null {
    return this.driver.exportBytes?.() ?? null;
  }

  async close() {
    await this.driver.close();
  }
}
