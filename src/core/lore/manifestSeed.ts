import type { StoryManifest } from '../manifest';
import type { EntityInput, LoreGraph } from './LoreGraph';

/** Siembra el grafo con el reparto, los objetos y las escenas declarados en el manifiesto. */
export async function seedFromManifest(graph: LoreGraph, manifest: StoryManifest): Promise<void> {
  const entities: EntityInput[] = [];
  for (const [id, character] of Object.entries(manifest.character_registry)) {
    entities.push({ id, category: 'character', name: character.name, attributes: { color: character.color_accent, moods: Object.keys(character.sprites) } });
  }
  for (const [id, item] of Object.entries(manifest.item_registry)) {
    entities.push({ id, category: 'item', name: item.name, attributes: { description: item.description } });
  }
  manifest.nodes.forEach((node, index) => {
    entities.push({ id: `scene:${node.node_id}`, category: 'scene', name: node.title ?? node.node_id, created_in_beat: index + 1, attributes: { node_id: node.node_id } });
  });
  await graph.upsertMany(entities);

  const edges = [];
  const sceneIds = new Set(manifest.nodes.map((n) => n.node_id));
  for (const [index, node] of manifest.nodes.entries()) {
    const source = `scene:${node.node_id}`;
    const targets = [node.navigation.default_next_node, ...node.navigation.choices.map((c) => c.target_node)].filter(
      (t): t is string => !!t && sceneIds.has(t),
    );
    for (const target of new Set(targets)) edges.push({ source, target: `scene:${target}`, relationship: 'leads_to', timestamp: (index + 1) * 1000 });
    const speakers = node.visual_novel_overlay?.enabled ? [node.visual_novel_overlay.active_speaker, ...node.visual_novel_overlay.lines.map((l) => l.speaker)] : [];
    for (const speaker of new Set(speakers)) {
      if (manifest.character_registry[speaker]) edges.push({ source: speaker, target: source, relationship: 'appears_in', timestamp: (index + 1) * 1000 });
    }
  }
  await graph.addEdges(edges);
}
