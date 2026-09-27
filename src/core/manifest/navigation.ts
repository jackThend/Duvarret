/**
 * Lógica de los caminos de la obra: vocabulario de marcas (flags), atributos del personaje y el
 * grafo de escenas que dibuja el «Mapa de caminos».
 */
import type { ChoiceCondition, StoryManifest } from './schema';

/** Todas las marcas que la obra concede o comprueba en algún lugar. */
export function knownFlags(manifest: StoryManifest): string[] {
  const flags = new Set<string>(manifest.initial_state.flags);
  for (const node of manifest.nodes) {
    node.grant_flags_on_enter.forEach((f) => flags.add(f));
    for (const c of node.navigation.choices) {
      c.grant_flags.forEach((f) => flags.add(f));
      if (c.condition?.required_flag) flags.add(c.condition.required_flag);
      if (c.condition?.forbidden_flag) flags.add(c.condition.forbidden_flag);
    }
    const gp = node.gameplay_overlay;
    if (gp) [...gp.on_success.grant_flags, ...gp.on_failure.grant_flags, ...gp.on_success.revoke_flags, ...gp.on_failure.revoke_flags].forEach((f) => flags.add(f));
    for (const check of node.rpg_checks) [...check.on_pass_grant_flags, ...check.on_fail_grant_flags].forEach((f) => flags.add(f));
  }
  return [...flags].sort();
}

/** Atributos del personaje que la obra usa. */
export function knownStats(manifest: StoryManifest): string[] {
  const stats = new Set(Object.keys(manifest.initial_state.stats));
  for (const node of manifest.nodes) {
    node.rpg_checks.forEach((c) => stats.add(c.stat));
    node.navigation.choices.forEach((c) => c.condition?.min_stat && stats.add(c.condition.min_stat.stat));
  }
  return [...stats].sort();
}

/** «alarma_desactivada» → «alarma desactivada». */
export const flagLabel = (flag: string) => flag.replace(/_/g, ' ');

/** «Alarma desactivada» → «alarma_desactivada». */
export function flagId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Descripción literaria de una condición («si ya ocurrió "alarma desactivada"»). */
export function describeCondition(condition: ChoiceCondition | undefined, itemName: (id: string) => string = (id) => id): string {
  if (!condition) return 'siempre';
  const parts: string[] = [];
  if (condition.required_flag) parts.push(`si ya ocurrió «${flagLabel(condition.required_flag)}»`);
  if (condition.forbidden_flag) parts.push(`si no ha ocurrido «${flagLabel(condition.forbidden_flag)}»`);
  if (condition.required_item) parts.push(`si lleva «${itemName(condition.required_item)}»`);
  if (condition.min_stat) parts.push(`si su ${condition.min_stat.stat} es al menos ${condition.min_stat.value}`);
  return parts.length ? parts.join(' y ') : 'siempre';
}

export type FlowEdgeKind = 'next' | 'choice' | 'success' | 'failure' | 'voice';

export interface FlowEdge {
  from: string;
  to: string;
  kind: FlowEdgeKind;
  label: string;
  /** El destino no existe. */
  broken: boolean;
}

export interface FlowNode {
  id: string;
  title: string;
  column: number;
  row: number;
  reachable: boolean;
  ending: boolean;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  start: string | null;
  columns: number;
}

export function flowGraph(manifest: StoryManifest): FlowGraph {
  const ids = new Set(manifest.nodes.map((n) => n.node_id));
  const edges: FlowEdge[] = [];
  const push = (from: string, to: string | undefined, kind: FlowEdgeKind, label: string) => {
    if (to === undefined) return;
    edges.push({ from, to, kind, label, broken: !ids.has(to) });
  };
  for (const node of manifest.nodes) {
    push(node.node_id, node.navigation.default_next_node, 'next', 'Continuar');
    node.navigation.choices.forEach((c) => push(node.node_id, c.target_node, 'choice', c.choice_text));
    push(node.node_id, node.gameplay_overlay?.on_success.transition_to_node, 'success', 'Enigma resuelto');
    push(node.node_id, node.gameplay_overlay?.on_failure.transition_to_node, 'failure', 'Enigma fallido');
    for (const prompt of node.screenless_mode?.voice_prompts ?? []) {
      for (const [key, target] of Object.entries(prompt.keypad_shortcuts)) push(node.node_id, target, 'voice', `Tecla ${key}`);
    }
  }

  // Columnas por distancia desde el inicio (recorrido en anchura).
  const start = manifest.initial_state.start_node && ids.has(manifest.initial_state.start_node) ? manifest.initial_state.start_node : (manifest.nodes[0]?.node_id ?? null);
  const depth = new Map<string, number>();
  if (start) {
    depth.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      for (const e of edges) {
        if (e.from !== current || e.broken || depth.has(e.to)) continue;
        depth.set(e.to, depth.get(current)! + 1);
        queue.push(e.to);
      }
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  const rows = new Map<number, number>();
  const nodes: FlowNode[] = manifest.nodes.map((n) => {
    const reachable = depth.has(n.node_id);
    // Las escenas inalcanzables se agrupan en una columna final, aparte.
    const column = reachable ? depth.get(n.node_id)! : maxDepth + 1;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    const nav = n.navigation;
    return {
      id: n.node_id,
      title: n.title ?? n.node_id,
      column,
      row,
      reachable,
      ending: nav.is_ending || (!nav.default_next_node && !nav.choices.length && !n.gameplay_overlay),
    };
  });
  return { nodes, edges, start, columns: Math.max(1, ...nodes.map((n) => n.column + 1)) };
}
