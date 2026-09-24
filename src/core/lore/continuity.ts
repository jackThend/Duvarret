/**
 * Supervisor de continuidad ontológica (RF-04, doc 04 §5.3).
 *
 * Antes de aprobar un acontecimiento, consulta el grafo y detecta contradicciones:
 * objetos destruidos o consumidos que reaparecen, personajes muertos que actúan, objetos en
 * poder de otro, paraderos incompatibles y requisitos lógicos (flags) incumplidos.
 */
import type { LoreGraph } from './LoreGraph';
import type { EntityState, LoreEntity, LoreEvent } from './types';

export type ContinuityCode = 'dead_actor' | 'item_unavailable' | 'item_not_held' | 'location_conflict' | 'missing_flag' | 'unknown_entity';

export interface ContinuityIssue {
  code: ContinuityCode;
  severity: 'error' | 'warning';
  entityId: string;
  /** Nota de continuidad en tono editorial, lista para mostrarse al artista. */
  message: string;
  suggestion?: string;
  /** Posición del fragmento en el texto analizado (para subrayar en el lienzo). */
  range?: { start: number; end: number };
  evidence?: LoreEvent | null;
}

export interface ProposedAction {
  /** Momento de la historia (beat * 1000 + orden). */
  timestamp: number;
  actor?: string;
  verb: 'use' | 'appear' | 'act' | 'speak' | 'move' | 'acquire';
  object?: string;
  location?: string;
  requiredFlags?: string[];
}

export interface ValidationResult {
  valid: boolean;
  issues: ContinuityIssue[];
  elapsedMs: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const REASONS: Record<string, string> = {
  destroyed: 'fue destruido',
  consumed: 'se consumió',
  lost: 'se perdió',
  dies: 'murió',
  confiscated: 'fue confiscado',
};

function where(event: LoreEvent | null | undefined): string {
  if (!event) return '';
  return event.beat ? ` en el beat ${event.beat}` : '';
}

export class ContinuitySupervisor {
  constructor(private readonly graph: LoreGraph) {}

  private async name(id: string | null | undefined): Promise<string> {
    if (!id) return '';
    return (await this.graph.getEntity(id))?.name ?? id;
  }

  private async alternatives(actor: string | undefined, timestamp: number, exclude: string): Promise<LoreEntity[]> {
    if (!actor) return [];
    return (await this.graph.inventoryOf(actor, timestamp)).filter((i) => i.id !== exclude);
  }

  /** `validateContinuity`: comprueba una acción propuesta contra el estado del grafo. */
  async validate(action: ProposedAction): Promise<ValidationResult> {
    const start = now();
    const issues: ContinuityIssue[] = [];
    const t = action.timestamp;

    if (action.actor) {
      const actor = await this.graph.getEntity(action.actor);
      if (!actor) {
        issues.push({ code: 'unknown_entity', severity: 'warning', entityId: action.actor, message: `«${action.actor}» aún no forma parte del lore de la obra.` });
      } else {
        const state = await this.graph.stateAt(actor.id, t);
        if (!state.alive && action.verb !== 'appear') {
          issues.push({
            code: 'dead_actor',
            severity: 'error',
            entityId: actor.id,
            evidence: state.terminalEvent,
            message: `Nota de continuidad: ${actor.name} murió${where(state.terminalEvent)}.`,
            suggestion: '¿Se trata de un recuerdo, una aparición o una voz grabada? También puedes reescribir quién actúa.',
          });
        }
        if (action.location && state.location && state.location !== action.location && action.verb !== 'move') {
          issues.push({
            code: 'location_conflict',
            severity: 'warning',
            entityId: actor.id,
            evidence: state.lastEvent,
            message: `Nota de continuidad: ${actor.name} está en ${await this.name(state.location)}, no en ${await this.name(action.location)}.`,
            suggestion: '¿Deseas narrar su desplazamiento antes de esta escena?',
          });
        }
      }
    }

    if (action.object && (action.verb === 'use' || action.verb === 'appear' || action.verb === 'acquire')) {
      const item = await this.graph.getEntity(action.object);
      if (item) {
        const state: EntityState = await this.graph.stateAt(item.id, t);
        if (!state.intact) {
          const reason = REASONS[state.terminalEvent?.action ?? ''] ?? 'ya no está disponible';
          const place = state.location ? ` (${await this.name(state.location)})` : '';
          const options = await this.alternatives(action.actor, t, item.id);
          issues.push({
            code: 'item_unavailable',
            severity: 'error',
            entityId: item.id,
            evidence: state.terminalEvent,
            message: `Nota de continuidad: ${item.name} ${reason}${where(state.terminalEvent)}${place}.`,
            suggestion: options.length
              ? `¿Deseas justificar que lo recuperó o prefieres usar ${options.map((o) => o.name).join(' o ')}, que tiene en el inventario?`
              : '¿Deseas justificar cómo lo recuperó?',
          });
        } else if (action.verb === 'use' && action.actor && state.holder && state.holder !== action.actor) {
          const holderName = await this.name(state.holder);
          const reason = state.lastEvent?.action === 'confiscated' ? `fue confiscado por ${holderName}` : `está en poder de ${holderName}`;
          issues.push({
            code: 'item_not_held',
            severity: 'warning',
            entityId: item.id,
            evidence: state.lastEvent,
            message: `Nota de continuidad: ${item.name} ${reason}${where(state.lastEvent)}.`,
            suggestion: '¿Deseas añadir una escena en la que lo recupere?',
          });
        }
      } else {
        issues.push({ code: 'unknown_entity', severity: 'warning', entityId: action.object, message: `«${action.object}» aún no forma parte del lore de la obra.` });
      }
    }

    if (action.requiredFlags?.length) {
      const flags = await this.graph.flags();
      for (const flag of action.requiredFlags) {
        if (!(flag in flags)) {
          issues.push({
            code: 'missing_flag',
            severity: 'warning',
            entityId: flag,
            message: `Nota de continuidad: este momento requiere que antes ocurra «${flag.replace(/_/g, ' ')}».`,
          });
        }
      }
    }

    return { valid: !issues.some((i) => i.severity === 'error'), issues, elapsedMs: now() - start };
  }

  /**
   * Analiza prosa del manuscrito: localiza menciones de entidades del lore y verbos de uso o
   * acción para detectar contradicciones mientras la autora escribe.
   */
  async analyzeText(text: string, timestamp: number, options: { actor?: string } = {}): Promise<ContinuityIssue[]> {
    const entities = (await this.graph.listEntities()).filter((e) => e.category === 'character' || e.category === 'item');
    const mentions = findMentions(text, entities);
    const issues: ContinuityIssue[] = [];
    const seen = new Set<string>();

    for (const sentence of splitSentences(text)) {
      const inSentence = mentions.filter((m) => m.start >= sentence.start && m.end <= sentence.end);
      if (!inSentence.length) continue;
      const lower = normalize(sentence.text);
      const actorMention = inSentence.find((m) => m.entity.category === 'character');
      const actor = actorMention?.entity.id ?? options.actor;

      for (const mention of inSentence) {
        const key = `${mention.entity.id}@${sentence.start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let result: ValidationResult | null = null;
        if (mention.entity.category === 'item' && USE_VERBS.test(lower)) {
          result = await this.validate({ timestamp, verb: 'use', object: mention.entity.id, ...(actor ? { actor } : {}) });
        } else if (mention.entity.category === 'character' && ACTION_VERBS.test(lower) && !MEMORY_WORDS.test(lower)) {
          result = await this.validate({ timestamp, verb: 'act', actor: mention.entity.id });
          result.issues = result.issues.filter((i) => i.code === 'dead_actor');
        }
        for (const issue of result?.issues ?? []) {
          if (issue.code === 'unknown_entity') continue;
          issues.push({ ...issue, range: { start: mention.start, end: mention.end } });
        }
      }
    }
    return issues;
  }
}

// ── Utilidades de análisis de texto ─────────────────────────────────────────

const USE_VERBS =
  /\b(extrajo|extrae|saco|saca|uso|usa|utilizo|utiliza|empuno|empuna|blandio|blande|disparo|dispara|abrio|abre|rompio|rompe|bebio|bebe|comio|come|leyo|lee|mostro|muestra|entrego|entrega|tomo|toma|agarro|agarra|sostuvo|sostiene|guardo|guarda|encendio|enciende|giro la|introdujo|introduce)\b/;
const ACTION_VERBS =
  /\b(dijo|dice|hablo|habla|camino|camina|corrio|corre|miro|mira|sonrio|sonrie|grito|grita|entro|entra|salio|sale|abrio|abre|tomo|toma|respondio|responde|pregunto|pregunta|llego|llega|susurro|susurra|golpeo|golpea|levanto|levanta)\b/;
const MEMORY_WORDS = /\b(recuerdo|recordaba|recordo|memoria|fantasma|espectro|tumba|cadaver|difunto|sueno|sonaba|retrato|fotografia|grabacion)\b/;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function splitSentences(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const re = /[^.!?¡¿\n]+[.!?]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].trim()) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export interface Mention {
  entity: LoreEntity;
  start: number;
  end: number;
  alias: string;
}

/** Localiza menciones por nombre o alias (sin distinguir mayúsculas ni acentos). */
export function findMentions(text: string, entities: LoreEntity[]): Mention[] {
  const haystack = normalize(text);
  const mentions: Mention[] = [];
  for (const entity of entities) {
    const aliases = [entity.name, ...(Array.isArray(entity.attributes.aliases) ? (entity.attributes.aliases as unknown[]).filter((a): a is string => typeof a === 'string') : [])];
    for (const alias of aliases) {
      const needle = normalize(alias).trim();
      if (needle.length < 3) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
      let m: RegExpExecArray | null;
      while ((m = re.exec(haystack))) mentions.push({ entity, start: m.index, end: m.index + m[0].length, alias });
    }
  }
  // Se conserva la mención más larga cuando se solapan.
  mentions.sort((a, b) => a.start - b.start || b.end - a.end);
  return mentions.filter((m, i) => !mentions.slice(0, i).some((p) => p.start <= m.start && p.end >= m.end && p !== m));
}
