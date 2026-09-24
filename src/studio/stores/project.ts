/**
 * Estado de la obra abierta en el Studio: manifiesto, metadatos, lore y assets.
 * Cada cambio pasa por el validador; la vista previa lo refleja de inmediato (< 200 ms).
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef, triggerRef } from 'vue';
import {
  checkIntegrity,
  hasBlockingIssues,
  validateManifest,
  validateManifestText,
  type Coordinates,
  type ManifestIssue,
  type StoryManifest,
  type StoryNode,
} from '@/core/manifest';
import { ManifestEditor } from '@/core/agent/manifestEditor';
import { AssetRegistry } from '@/core/assets/registry';
import { ContinuitySupervisor, LoreGraph, seedFromManifest, type ContinuityIssue } from '@/core/lore';
import { createMeta, manifestFromManuscript, MemoryStorage, ProjectMetaSchema, type ProjectMeta, type ProjectStorage } from '@/core/project';
import type { ParsedManuscript } from '@/core/ingest/sceneParser';
import { openLoreDriver } from '../services/lore';

export type NodeFormat = 'text' | 'ergodic' | 'visual_novel' | 'gameplay' | 'audio';

export const FORMAT_ICONS: Record<NodeFormat, string> = {
  text: '📖',
  ergodic: '🌀',
  visual_novel: '🎭',
  gameplay: '🕹️',
  audio: '🎧',
};

export function nodeFormats(node: StoryNode): NodeFormat[] {
  const formats: NodeFormat[] = [];
  const te = node.typographic_engine;
  if (te && (te.layout_mode !== 'standard' || te.heartbeat_sync?.enabled || te.flashlight_reveal?.enabled || te.melt?.enabled || te.flicker_effect)) formats.push('ergodic');
  if (node.visual_novel_overlay?.enabled) formats.push('visual_novel');
  if (node.gameplay_overlay) formats.push('gameplay');
  if (node.acoustic_events.length || node.screenless_mode) formats.push('audio');
  return formats.length ? formats : ['text'];
}

export interface Chapter {
  id: string;
  title: string;
  nodes: StoryNode[];
}

export const useProjectStore = defineStore('duvarret-project', () => {
  const manifest = shallowRef<StoryManifest>(validateManifest({ metadata: { title: 'Obra sin título' }, nodes: [] }).manifest);
  const meta = ref<ProjectMeta>(createMeta());
  const assets = shallowRef(new AssetRegistry());
  const storage = shallowRef<ProjectStorage>(new MemoryStorage());
  const lore = shallowRef<LoreGraph | null>(null);
  const supervisor = shallowRef<ContinuitySupervisor | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const dirty = ref(false);
  const lastSavedAt = ref<string | null>(null);
  const loadIssues = ref<ManifestIssue[]>([]);
  const continuity = ref<Record<string, ContinuityIssue[]>>({});
  const assetBase = ref('');
  /** Marca de tiempo del último cambio (para medir la latencia de la vista previa). */
  const changedAt = ref(0);
  const undoStack: StoryManifest[] = [];
  const redoStack: StoryManifest[] = [];

  const nodes = computed(() => manifest.value.nodes);
  const selectedNode = computed(() => nodes.value.find((n) => n.node_id === selectedNodeId.value) ?? null);
  const selectedIndex = computed(() => nodes.value.findIndex((n) => n.node_id === selectedNodeId.value));
  const integrity = computed(() => checkIntegrity(manifest.value));
  const canExport = computed(() => !hasBlockingIssues(integrity.value));
  const characters = computed(() => Object.entries(manifest.value.character_registry).map(([id, c]) => ({ id, ...c })));
  const items = computed(() => Object.entries(manifest.value.item_registry).map(([id, i]) => ({ id, ...i })));
  const chapters = computed<Chapter[]>(() => {
    const out: Chapter[] = [];
    for (const node of nodes.value) {
      const id = node.chapter_id ?? 'sin_capitulo';
      let chapter = out.find((c) => c.id === id);
      if (!chapter) {
        chapter = { id, title: node.chapter_id ? chapterTitle(id, node) : 'Escenas', nodes: [] };
        out.push(chapter);
      }
      chapter.nodes.push(node);
    }
    return out;
  });

  function chapterTitle(id: string, first: StoryNode) {
    const pretty = id.replace(/^cap_?\d*_?/, '').replace(/_/g, ' ').trim();
    return first.title?.split(' · ')[0] ?? (pretty ? pretty[0]!.toUpperCase() + pretty.slice(1) : id);
  }

  function commit(next: StoryManifest, options: { undoable?: boolean } = {}) {
    if (options.undoable !== false) {
      undoStack.push(manifest.value);
      if (undoStack.length > 100) undoStack.shift();
      redoStack.length = 0;
    }
    manifest.value = next;
    dirty.value = true;
    changedAt.value = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!nodes.value.some((n) => n.node_id === selectedNodeId.value)) selectedNodeId.value = nodes.value[0]?.node_id ?? null;
  }

  function undo() {
    const previous = undoStack.pop();
    if (!previous) return false;
    redoStack.push(manifest.value);
    commit(previous, { undoable: false });
    return true;
  }

  function redo() {
    const next = redoStack.pop();
    if (!next) return false;
    undoStack.push(manifest.value);
    commit(next, { undoable: false });
    return true;
  }

  async function initLore(bytes: Uint8Array | null = null) {
    const graph = await LoreGraph.open(await openLoreDriver(bytes));
    if (!bytes) await seedFromManifest(graph, manifest.value);
    lore.value = graph;
    supervisor.value = new ContinuitySupervisor(graph);
  }

  /** Abre una obra a partir de su manifiesto (objeto o texto) y metadatos opcionales. */
  async function open(options: {
    manifest: unknown;
    meta?: Partial<ProjectMeta>;
    storage?: ProjectStorage;
    assets?: AssetRegistry;
    lore?: Uint8Array | null;
    assetBase?: string;
    withLore?: boolean;
  }) {
    const result = typeof options.manifest === 'string' ? validateManifestText(options.manifest) : validateManifest(options.manifest);
    manifest.value = result.manifest;
    loadIssues.value = result.issues;
    meta.value = createMeta({ title: result.manifest.metadata.title, author: result.manifest.metadata.author, ...(options.meta ?? {}) });
    if (options.storage) storage.value = options.storage;
    assets.value = options.assets ?? new AssetRegistry();
    assetBase.value = options.assetBase ?? '';
    selectedNodeId.value = result.manifest.initial_state.start_node ?? result.manifest.nodes[0]?.node_id ?? null;
    undoStack.length = 0;
    redoStack.length = 0;
    continuity.value = {};
    dirty.value = false;
    lore.value = null;
    supervisor.value = null;
    if (options.withLore !== false) await initLore(options.lore ?? null);
  }

  async function openFromStorage(target: ProjectStorage, fallback?: unknown) {
    const files = await target.load();
    if (!files.manifest && fallback === undefined) throw new Error('No se encontró la obra.');
    await open({
      manifest: files.manifest ?? fallback,
      ...(files.meta ? { meta: ProjectMetaSchema.parse(JSON.parse(files.meta)) } : {}),
      storage: target,
      assets: files.assets ? AssetRegistry.fromJson(files.assets) : new AssetRegistry(),
      lore: files.lore,
    });
  }

  async function save() {
    meta.value = { ...meta.value, title: manifest.value.metadata.title, updated_at: new Date().toISOString() };
    await storage.value.save({
      meta: JSON.stringify(meta.value, null, 2),
      manifest: JSON.stringify(manifest.value, null, 2),
      assets: JSON.stringify(assets.value.toJSON(), null, 2),
      lore: lore.value?.exportBytes() ?? null,
    });
    dirty.value = false;
    lastSavedAt.value = new Date().toISOString();
  }

  async function importManuscript(parsed: ParsedManuscript, options: { title?: string; author?: string } = {}) {
    await open({
      manifest: manifestFromManuscript(parsed, { title: options.title ?? parsed.title, author: options.author ?? meta.value.author }),
      meta: { mode: 'exegesis', ...(options.title ? { title: options.title } : {}) },
      storage: storage.value,
    });
    dirty.value = true;
  }

  function select(nodeId: string) {
    if (nodes.value.some((n) => n.node_id === nodeId)) selectedNodeId.value = nodeId;
  }

  function selectRelative(delta: number) {
    const next = nodes.value[selectedIndex.value + delta];
    if (next) selectedNodeId.value = next.node_id;
  }

  function editor() {
    return new ManifestEditor(manifest.value);
  }

  function patchNode(nodeId: string, patch: Record<string, unknown>, options: { undoable?: boolean } = {}) {
    const ed = editor();
    const result = ed.patchNode(nodeId, patch);
    commit(ed.current, options);
    return result;
  }

  function updateText(nodeId: string, text: string) {
    return patchNode(nodeId, { text_payload: text });
  }

  function updateTitle(nodeId: string, title: string) {
    return patchNode(nodeId, { title });
  }

  function setMetadata(patch: Partial<StoryManifest['metadata']>) {
    const ed = editor();
    ed.patchManifest({ metadata: patch });
    commit(ed.current);
  }

  /** Acepta el borrador propuesto por el co-director. */
  function applyDraft(draft: StoryManifest) {
    commit(validateManifest(draft).manifest);
  }

  /** Radar: reubica una fuente sonora sin que el autor escriba una cifra. */
  function moveAcousticEvent(nodeId: string, eventId: string, coordinates: Coordinates) {
    const node = nodes.value.find((n) => n.node_id === nodeId);
    if (!node) return;
    const events = node.acoustic_events.map((e) => (e.event_id === eventId ? { ...e, coordinates } : e));
    patchNode(nodeId, { acoustic_events: events }, { undoable: true });
  }

  function addNode(afterId?: string) {
    const ed = editor();
    let n = nodes.value.length + 1;
    while (nodes.value.some((x) => x.node_id === `escena_${String(n).padStart(3, '0')}`)) n++;
    const id = `escena_${String(n).padStart(3, '0')}`;
    const anchor = nodes.value.find((x) => x.node_id === (afterId ?? selectedNodeId.value));
    ed.patchNode(id, {
      title: 'Nueva escena',
      text_payload: '',
      ...(anchor?.chapter_id ? { chapter_id: anchor.chapter_id } : {}),
      navigation: anchor?.navigation.default_next_node ? { default_next_node: anchor.navigation.default_next_node } : { is_ending: true },
    });
    const next = ed.current;
    const created = next.nodes.pop()!;
    const at = anchor ? next.nodes.findIndex((x) => x.node_id === anchor.node_id) + 1 : next.nodes.length;
    next.nodes.splice(at, 0, created);
    if (anchor) {
      const a = next.nodes.find((x) => x.node_id === anchor.node_id)!;
      a.navigation = { ...a.navigation, default_next_node: id, is_ending: false };
    }
    commit(next);
    selectedNodeId.value = id;
    return id;
  }

  function removeNode(nodeId: string) {
    const next = structuredClone(manifest.value);
    const removed = next.nodes.find((n) => n.node_id === nodeId);
    next.nodes = next.nodes.filter((n) => n.node_id !== nodeId);
    // Se reencaminan las continuaciones que apuntaban a la escena eliminada.
    for (const n of next.nodes) {
      if (n.navigation.default_next_node === nodeId) {
        n.navigation.default_next_node = removed?.navigation.default_next_node;
        if (!n.navigation.default_next_node) n.navigation.is_ending = true;
      }
      n.navigation.choices = n.navigation.choices.filter((c) => c.target_node !== nodeId);
    }
    commit(next);
  }

  /** Supervisión de continuidad del texto de una escena (subrayado ámbar en el lienzo). */
  async function analyzeContinuity(nodeId: string) {
    const node = nodes.value.find((n) => n.node_id === nodeId);
    if (!node || !supervisor.value) return [];
    const index = nodes.value.indexOf(node);
    const issues = await supervisor.value.analyzeText(node.text_payload, (index + 1) * 1000);
    continuity.value = { ...continuity.value, [nodeId]: issues };
    return issues;
  }

  function touchAssets() {
    triggerRef(assets);
  }

  return {
    manifest,
    meta,
    assets,
    storage,
    lore,
    supervisor,
    selectedNodeId,
    selectedNode,
    selectedIndex,
    nodes,
    chapters,
    characters,
    items,
    integrity,
    canExport,
    dirty,
    lastSavedAt,
    loadIssues,
    continuity,
    assetBase,
    changedAt,
    open,
    openFromStorage,
    save,
    importManuscript,
    select,
    selectRelative,
    patchNode,
    updateText,
    updateTitle,
    setMetadata,
    applyDraft,
    moveAcousticEvent,
    addNode,
    removeNode,
    analyzeContinuity,
    initLore,
    undo,
    redo,
    touchAssets,
  };
});

export type ProjectStore = ReturnType<typeof useProjectStore>;
