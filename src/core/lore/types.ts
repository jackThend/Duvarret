export const ENTITY_CATEGORIES = ['character', 'location', 'item', 'faction', 'mystery', 'emotional_state', 'scene'] as const;
export type EntityCategory = (typeof ENTITY_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<EntityCategory, string> = {
  character: 'Personajes',
  location: 'Lugares',
  item: 'Objetos',
  faction: 'Facciones',
  mystery: 'Misterios y pistas',
  emotional_state: 'Estados de ánimo',
  scene: 'Escenas',
};

export type JsonObject = Record<string, unknown>;

export interface LoreEntity {
  id: string;
  category: EntityCategory;
  name: string;
  attributes: JsonObject;
  status_flags: JsonObject;
  created_in_beat: number;
}

export interface LoreEdge {
  id: number;
  source_node_id: string;
  target_node_id: string;
  relationship: string;
  weight: number;
  timeline_timestamp: number;
  properties: JsonObject;
}

/** Acciones que alteran el estado ontológico a lo largo de la línea temporal. */
export const EVENT_ACTIONS = [
  'appears',
  'dies',
  'revives',
  'destroyed',
  'consumed',
  'lost',
  'repaired',
  'confiscated',
  'acquired',
  'given',
  'moved_to',
] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];

export interface LoreEvent {
  id: number;
  timestamp: number;
  beat: number;
  subject: string;
  action: EventAction;
  object: string | null;
  location: string | null;
  description: string;
}

export interface EntityState {
  id: string;
  alive: boolean;
  intact: boolean;
  holder: string | null;
  location: string | null;
  lastEvent: LoreEvent | null;
  /** Evento que dejó a la entidad fuera de juego (muerte, destrucción, consumo…). */
  terminalEvent: LoreEvent | null;
}
