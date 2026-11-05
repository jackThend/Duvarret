import { ref } from 'vue';
import { z } from 'zod';
import { BrowserAssetStore } from './assetStore';
import { MAX_SCENE_FILE, decodeSceneAsset, parseScenePackage, remapSceneMedia, sceneMedia, type ScenePackage } from '@/core/repertoire/package';
import { NARRATIVE_SCENES, defaultNarrativeParams, isNarrativeType } from '@/core/gameplay/narrative';
import { GameplayOverlaySchema } from '@/core/manifest';
import { ManifestEditor } from '@/core/agent/manifestEditor';
import { normalizeText } from '@/core/ingest/toneAnalyzer';
import { readWorkResource } from './personalLibrary';
import type { ProjectStore } from '../stores/project';

const KEY = 'duvarret:repertorio:v1';
const files = new BrowserAssetStore(KEY);
const Entry = z.object({ id: z.string(), name: z.string(), description: z.string(), tags: z.array(z.string()), type: z.string(), favorite: z.boolean() });
export type RepertoireEntry = z.output<typeof Entry>;
export const repertoire = ref<RepertoireEntry[]>([]);
const builtins = NARRATIVE_SCENES.map(s => ({ id: s.type, name: s.title, description: s.when, tags: [], type: s.type, favorite: false }));
let queue: Promise<unknown> = Promise.resolve();
function index() {
  const data = localStorage.getItem(KEY);
  return data ? z.array(Entry).parse(JSON.parse(data)) : [];
}
export function refreshRepertoire() {
  const entries = index();
  repertoire.value = [...builtins.map(s => entries.find(e => e.id === s.id) ?? s), ...entries.filter(e => !isNarrativeType(e.id))];
}
function update(operation: () => Promise<void>) {
  const next = queue.catch(() => undefined).then(operation);
  queue = next;
  return next;
}
function write(entries: RepertoireEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
  refreshRepertoire();
}
export function favoriteScene(entry: RepertoireEntry) {
  return update(async () => {
    const entries = index();
    const current = entries.find(e => e.id === entry.id) ?? entry;
    write([...entries.filter(e => e.id !== entry.id), { ...current, favorite: !current.favorite }]);
  });
}
export function storeScene(raw: string) {
  return update(async () => {
    const pack = parseScenePackage(raw);
    const id = crypto.randomUUID();
    const url = await files.put(id, new TextEncoder().encode(raw));
    URL.revokeObjectURL(url);
    try {
      write([...index(), { id, name: pack.name, description: pack.description, tags: pack.tags, type: pack.overlay.type, favorite: false }]);
    } catch (error) {
      await files.remove(id);
      throw error;
    }
  });
}
export async function getScene(id: string): Promise<ScenePackage> {
  if (isNarrativeType(id)) {
    const scene = NARRATIVE_SCENES.find(s => s.type === id)!;
    return parseScenePackage(JSON.stringify({ format: 'duvarret-scene', version: 1, name: scene.title, description: scene.when, overlay: { type: id, title: scene.title, parameters: defaultNarrativeParams(id), is_mandatory_to_advance: true } }));
  }
  return parseScenePackage(new TextDecoder().decode(await files.read(id)));
}
export function filterScenes(query: string) {
  const tokens = normalizeText(query).trim().split(/\s+/).filter(Boolean);
  return repertoire.value.filter(s => tokens.every(token => normalizeText([s.name, s.description, ...s.tags].join(' ')).includes(token)));
}
export function suggestScenes(text: string) {
  const words = new Set(normalizeText(text).match(/[a-z0-9]{4,}/g) ?? []);
  const score = (entry: RepertoireEntry) => {
    const mechanic = NARRATIVE_SCENES.find(s => s.type === entry.type);
    const tags = normalizeText([entry.name, ...entry.tags].join(' ')).match(/[a-z0-9]{4,}/g) ?? [];
    return (mechanic?.match.test(normalizeText(text)) ? 2 : 0) + [...new Set(tags)].filter(word => words.has(word)).length;
  };
  return repertoire.value.map(entry => ({ entry, score: score(entry) })).filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.entry.favorite) - Number(a.entry.favorite)).map(e => e.entry).slice(0, 8);
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export async function captureScene(project: ProjectStore, name: string, description: string, tags: string[]) {
  const original = project.selectedNode?.gameplay_overlay;
  if (!original || !isNarrativeType(original.type)) throw new Error('Guarda primero una de las diez escenas narrativas en esta obra.');
  const identity = project.workIdentity();
  const overlay = GameplayOverlaySchema.parse(original);
  const items: ScenePackage['items'] = {};
  for (const outcome of [overlay.on_success, overlay.on_failure]) {
    delete outcome.transition_to_node;
    for (const id of [...outcome.grant_items, ...outcome.consume_items]) {
      const item = project.manifest.item_registry[id];
      if (item && !Object.hasOwn(items, id)) Object.defineProperty(items, id, { value: { ...item }, enumerable: true });
    }
  }
  const assets: ScenePackage['assets'] = {};
  const paths = new Map<string, string>();
  let total = 0;
  for (const [path, kind] of sceneMedia(overlay, items)) {
    if (!/^assets\/(images|audio)\/[\w./-]+\.[\w]+$/i.test(path) || path.split('/').some(part => part === '..' || part === '.')) throw new Error('Añade el recurso a la obra antes de compartirlo.');
    const bytes = await readWorkResource(project, path);
    if (identity !== project.workIdentity()) throw new Error('La obra cambió durante la lectura de la escena.');
    total += bytes.length;
    if (total > MAX_SCENE_FILE * .7) throw new Error('Los recursos superan el límite del paquete.');
    const portablePath = `assets/${kind}/recurso-${paths.size + 1}.${path.split('.').at(-1)!.toLowerCase()}`;
    paths.set(path, portablePath);
    assets[portablePath] = encode(bytes);
  }
  const mapped = remapSceneMedia({ format: 'duvarret-scene', version: 1, name, description, tags, overlay, items, assets }, paths);
  return parseScenePackage(JSON.stringify({ format: 'duvarret-scene', version: 1, name, description, tags, ...mapped, assets, style: project.manifest.global_settings.visual_style }));
}

export async function applyScene(project: ProjectStore, input: ScenePackage, replace: boolean) {
  const pack = parseScenePackage(JSON.stringify(input));
  const node = project.selectedNode;
  if (!node) throw new Error('Selecciona una escena de la obra.');
  if (node.gameplay_overlay && !replace) throw new Error('Confirma que deseas sustituir la mecánica de esta escena.');
  const identity = project.workIdentity();
  const check = () => {
    if (identity !== project.workIdentity() || project.selectedNode !== node) throw new Error('La escena cambió. Vuelve a abrir Repertorio.');
  };
  const paths = new Map<string, string>();
  for (const [path, data] of Object.entries(pack.assets)) {
    check();
    const saved = await project.addAsset({ name: path.split('/').at(-1)!, data: decodeSceneAsset(data) }, { collect: false });
    paths.set(path, saved);
  }
  check();
  const { overlay, items } = remapSceneMedia(pack, paths);
  const itemIds = new Map(Object.keys(items).map(id => [id, 'repertorio-' + crypto.randomUUID()]));
  for (const outcome of [overlay.on_success, overlay.on_failure]) {
    outcome.grant_items = outcome.grant_items.map(id => itemIds.get(id)!);
    outcome.consume_items = outcome.consume_items.map(id => itemIds.get(id)!);
  }
  const editor = new ManifestEditor(project.manifest);
  editor.patchManifest({ item_registry: Object.fromEntries(Object.entries(items).map(([id, item]) => [itemIds.get(id), item])),
    ...(pack.style ? { global_settings: { visual_style: pack.style } } : {}) });
  editor.patchNode(node.node_id, { gameplay_overlay: undefined });
  editor.patchNode(node.node_id, { gameplay_overlay: overlay });
  project.applyDraft(editor.current);
  await project.save();
}
