import type { ChoiceCondition, Outcome } from '@/core/manifest';

/** Estado de juego serializable (flags, inventario y atributos del personaje). */
export interface GameState {
  flags: string[];
  inventory: string[];
  stats: Record<string, number>;
}

export function evaluateCondition(condition: ChoiceCondition | undefined, state: GameState): boolean {
  if (!condition) return true;
  if (condition.required_flag && !state.flags.includes(condition.required_flag)) return false;
  if (condition.forbidden_flag && state.flags.includes(condition.forbidden_flag)) return false;
  if (condition.required_item && !state.inventory.includes(condition.required_item)) return false;
  if (condition.min_stat && (state.stats[condition.min_stat.stat] ?? 0) < condition.min_stat.value) return false;
  return true;
}

const unique = (values: string[]) => [...new Set(values)];

/** Aplica un desenlace de forma inmutable. */
export function applyOutcome(state: GameState, outcome: Partial<Outcome>): GameState {
  const revoke = new Set(outcome.revoke_flags ?? []);
  const consume = new Set(outcome.consume_items ?? []);
  return {
    stats: { ...state.stats },
    flags: unique([...state.flags.filter((f) => !revoke.has(f)), ...(outcome.grant_flags ?? [])]),
    inventory: unique([...state.inventory.filter((i) => !consume.has(i)), ...(outcome.grant_items ?? [])]),
  };
}
