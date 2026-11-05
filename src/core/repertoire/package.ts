import { z } from 'zod';
import { GameplayOverlaySchema, ItemSchema, type GameplayOverlay } from '../manifest';
import { isNarrativeType, validateNarrativeParams } from '../gameplay/narrative';
import { assetFolderFor } from '../assets/usages';
import { checkAssetContent } from '../assets/content';
import { VisualStyleSchema } from '../visual/style';

export const MAX_SCENE_FILE = 24 * 1024 * 1024;
const safePath = z.string().regex(/^assets\/(images|audio)\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/);
const PackageSchema = z.strictObject({
  format: z.literal('duvarret-scene'),
  version: z.literal(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(600).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(16).default([]),
  overlay: GameplayOverlaySchema,
  items: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), ItemSchema).default({}),
  assets: z.record(safePath, z.string()).default({}),
  style: VisualStyleSchema.optional(),
});
export type ScenePackage = z.output<typeof PackageSchema>;

export function sceneMedia(overlay: GameplayOverlay, items: ScenePackage['items']) {
  const paths = new Map<string, 'images' | 'audio'>();
  if (typeof overlay.parameters.artwork === 'string' && overlay.parameters.artwork) paths.set(overlay.parameters.artwork, 'images');
  for (const outcome of [overlay.on_success, overlay.on_failure]) if (outcome.play_sfx) paths.set(outcome.play_sfx, 'audio');
  for (const item of Object.values(items)) if (item.icon) paths.set(item.icon, 'images');
  return paths;
}

export function decodeSceneAsset(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error('Un recurso del paquete tiene una codificación inválida.');
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

export function parseScenePackage(raw: string): ScenePackage {
  if (raw.length > MAX_SCENE_FILE || new TextEncoder().encode(raw).length > MAX_SCENE_FILE) throw new Error('La escena supera el límite de 24 MiB.');
  const data = PackageSchema.parse(JSON.parse(raw));
  if (!isNarrativeType(data.overlay.type)) throw new Error('Este paquete necesita una mecánica compatible con Repertorio.');
  data.overlay.parameters = validateNarrativeParams(data.overlay.type, data.overlay.parameters);
  for (const outcome of [data.overlay.on_success, data.overlay.on_failure]) {
    if (outcome.transition_to_node) throw new Error('Un paquete portable no puede saltar a una escena de otra obra.');
    for (const id of [...outcome.grant_items, ...outcome.consume_items]) {
      if (!Object.hasOwn(data.items, id)) throw new Error('El paquete hace referencia a un objeto que no incluye.');
    }
  }
  const media = sceneMedia(data.overlay, data.items);
  if (media.size > 32 || Object.keys(data.assets).length !== media.size) throw new Error('El paquete debe incluir solo los recursos que utiliza, hasta 32.');
  for (const [path, kind] of media) {
    if (!safePath.safeParse(path).success || !Object.hasOwn(data.assets, path) || assetFolderFor(path) !== kind) throw new Error('Falta un recurso interno del paquete o su formato no corresponde.');
    const bytes = decodeSceneAsset(data.assets[path]!);
    const checked = checkAssetContent(path, bytes);
    if (!checked.ok || checked.name !== path) throw new Error('Un archivo incluido está dañado o no coincide con su extensión.');
    // SVG importado como imagen: excluye elementos activos y referencias fuera del archivo.
    if (/\.svg$/i.test(path) && /<!doctype|<!entity|<\s*(script|foreignObject|style|animate|set)\b|\bon\w+\s*=|\b(?:href|src)\s*=|url\s*\(/i.test(new TextDecoder().decode(bytes))) throw new Error('Usa un SVG estático sin referencias externas, o una imagen PNG.');
  }
  return data;
}

export function remapSceneMedia(pack: ScenePackage, paths: ReadonlyMap<string, string>) {
  const overlay = structuredClone(pack.overlay);
  if (typeof overlay.parameters.artwork === 'string' && overlay.parameters.artwork) overlay.parameters.artwork = paths.get(overlay.parameters.artwork);
  for (const outcome of [overlay.on_success, overlay.on_failure]) if (outcome.play_sfx) outcome.play_sfx = paths.get(outcome.play_sfx);
  const items = structuredClone(pack.items);
  for (const item of Object.values(items)) if (item.icon) item.icon = paths.get(item.icon);
  return { overlay, items };
}
