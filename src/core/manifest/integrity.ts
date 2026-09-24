/**
 * Integridad referencial del manifiesto en tiempo de compilación (doc 03 §6).
 *
 * Cualquier diagnóstico de severidad `error` bloquea la exportación en el Studio.
 */
import type { ManifestIssue } from './diagnostics';
import type { StoryManifest } from './schema';

export function checkIntegrity(manifest: StoryManifest): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const ids = new Set<string>();
  const characters = new Set(Object.keys(manifest.character_registry));
  const items = new Set(Object.keys(manifest.item_registry));

  manifest.nodes.forEach((node, index) => {
    if (ids.has(node.node_id)) {
      issues.push({
        severity: 'error',
        path: `nodes.${index}.node_id`,
        code: 'duplicate_node',
        message: `Hay dos escenas con el mismo nombre interno «${node.node_id}».`,
        nodeId: node.node_id,
      });
    }
    ids.add(node.node_id);
  });

  const requireNode = (target: string | undefined, path: string, nodeId: string, what: string) => {
    if (target === undefined || target === '') {
      if (target === '') {
        issues.push({ severity: 'error', path, code: 'empty_target', message: `${what} no indica a qué escena conduce.`, nodeId });
      }
      return;
    }
    if (!ids.has(target)) {
      issues.push({
        severity: 'error',
        path,
        code: 'missing_node',
        message: `${what} conduce a «${target}», una escena que aún no existe.`,
        nodeId,
      });
    }
  };

  const requireItem = (item: string, path: string, nodeId: string) => {
    if (!items.has(item)) {
      issues.push({
        severity: 'warning',
        path,
        code: 'unknown_item',
        message: `El objeto «${item}» no figura en el inventario de la obra.`,
        nodeId,
      });
    }
  };

  manifest.initial_state.inventory.forEach((item, i) => requireItem(item, `initial_state.inventory.${i}`, ''));
  if (manifest.initial_state.start_node && !ids.has(manifest.initial_state.start_node)) {
    issues.push({
      severity: 'error',
      path: 'initial_state.start_node',
      code: 'missing_node',
      message: `La obra comienza en «${manifest.initial_state.start_node}», una escena que no existe.`,
    });
  }
  if (manifest.nodes.length === 0) {
    issues.push({ severity: 'error', path: 'nodes', code: 'no_nodes', message: 'La obra todavía no tiene escenas.' });
  }

  manifest.nodes.forEach((node, n) => {
    const base = `nodes.${n}`;
    const id = node.node_id;
    const nav = node.navigation;
    requireNode(nav.default_next_node, `${base}.navigation.default_next_node`, id, 'La continuación natural');
    nav.choices.forEach((choice, c) => {
      requireNode(choice.target_node, `${base}.navigation.choices.${c}.target_node`, id, `La elección «${choice.choice_text}»`);
      if (choice.condition?.required_item) {
        requireItem(choice.condition.required_item, `${base}.navigation.choices.${c}.condition.required_item`, id);
      }
    });

    const gp = node.gameplay_overlay;
    if (gp) {
      requireNode(gp.on_success.transition_to_node, `${base}.gameplay_overlay.on_success.transition_to_node`, id, 'El éxito del enigma');
      requireNode(gp.on_failure.transition_to_node, `${base}.gameplay_overlay.on_failure.transition_to_node`, id, 'El fracaso del enigma');
      for (const key of ['grant_items', 'consume_items'] as const) {
        gp.on_success[key].forEach((it, i) => requireItem(it, `${base}.gameplay_overlay.on_success.${key}.${i}`, id));
        gp.on_failure[key].forEach((it, i) => requireItem(it, `${base}.gameplay_overlay.on_failure.${key}.${i}`, id));
      }
      const clue = gp.parameters.clue_reference_item;
      if (typeof clue === 'string') requireItem(clue, `${base}.gameplay_overlay.parameters.clue_reference_item`, id);
      if (gp.is_mandatory_to_advance && !gp.on_success.transition_to_node && !nav.default_next_node && !nav.is_ending) {
        issues.push({
          severity: 'warning',
          path: `${base}.gameplay_overlay`,
          code: 'dead_end',
          message: 'El enigma obligatorio no indica hacia dónde continúa la historia al resolverse.',
          nodeId: id,
        });
      }
    }

    node.grant_items_on_enter.forEach((it, i) => requireItem(it, `${base}.grant_items_on_enter.${i}`, id));

    node.screenless_mode?.voice_prompts.forEach((prompt, p) => {
      prompt.voice_options.forEach((opt, o) =>
        requireNode(opt.target_node, `${base}.screenless_mode.voice_prompts.${p}.voice_options.${o}.target_node`, id, `La opción de voz «${opt.phrase}»`),
      );
      for (const [key, target] of Object.entries(prompt.keypad_shortcuts)) {
        requireNode(target, `${base}.screenless_mode.voice_prompts.${p}.keypad_shortcuts.${key}`, id, `La tecla ${key}`);
      }
    });

    const vn = node.visual_novel_overlay;
    if (vn?.enabled) {
      const speakers = [vn.active_speaker, ...vn.lines.map((l) => l.speaker)];
      speakers.forEach((speaker) => {
        if (!characters.has(speaker)) {
          issues.push({
            severity: 'warning',
            path: `${base}.visual_novel_overlay`,
            code: 'unknown_character',
            message: `El personaje «${speaker}» habla pero no figura en el reparto.`,
            nodeId: id,
          });
        }
      });
    }

    const hasExit =
      nav.is_ending ||
      nav.default_next_node !== undefined ||
      nav.choices.length > 0 ||
      gp?.on_success.transition_to_node !== undefined ||
      (node.screenless_mode?.voice_prompts.length ?? 0) > 0;
    if (!hasExit) {
      issues.push({
        severity: 'info',
        path: `${base}.navigation`,
        code: 'implicit_ending',
        message: 'Esta escena no conduce a ninguna otra; se tratará como un final.',
        nodeId: id,
      });
    }
  });

  return issues;
}

/** Escenas a las que ningún camino conduce (excepto la inicial). */
export function findUnreachableNodes(manifest: StoryManifest): string[] {
  const start = manifest.initial_state.start_node ?? manifest.nodes[0]?.node_id;
  if (!start) return [];
  const edges = new Map<string, string[]>();
  for (const node of manifest.nodes) {
    const targets = [
      node.navigation.default_next_node,
      ...node.navigation.choices.map((c) => c.target_node),
      node.gameplay_overlay?.on_success.transition_to_node,
      node.gameplay_overlay?.on_failure.transition_to_node,
      ...(node.screenless_mode?.voice_prompts.flatMap((p) => [
        ...p.voice_options.map((o) => o.target_node),
        ...Object.values(p.keypad_shortcuts),
      ]) ?? []),
    ].filter((t): t is string => typeof t === 'string' && t.length > 0);
    edges.set(node.node_id, targets);
  }
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of edges.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return manifest.nodes.map((n) => n.node_id).filter((id) => !visited.has(id));
}
