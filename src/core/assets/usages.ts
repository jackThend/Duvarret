/**
 * Dónde se usa cada recurso de la obra, descrito en lenguaje literario
 * («Retrato de Sancho Panza (alarmado)», «Sonido «gotera» en El Pasillo»).
 */
import type { ManifestIssue, StoryManifest } from '../manifest';

export type AssetUsages = Map<string, string[]>;

/** Un uso concreto de un recurso: dónde aparece, dicho para el autor, y su escena si la tiene. */
export interface AssetUsage { path: string; where: string; nodeId?: string }

export function assetUsageList(manifest: StoryManifest): AssetUsage[] {
  const list: AssetUsage[] = [];
  const add = (path: string | undefined, where: string, nodeId?: string) => {
    if (path) list.push({ path: path.replace(/^\.\//, ''), where, ...(nodeId ? { nodeId } : {}) });
  };
  add(manifest.acoustic_environment.ambience_bed, 'Ambiente de fondo de la obra');
  manifest.global_settings.narration_voice?.clips.forEach(clip => add(clip.asset, `Voz de la obra: ${clip.text.slice(0, 70)}`));
  for (const c of Object.values(manifest.character_registry)) {
    for (const [mood, path] of Object.entries(c.sprites)) add(path, `Retrato de ${c.name} (${mood})`);
    add(c.voice_profile?.locution_sample, `Voz de ${c.name}`);
  }
  for (const item of Object.values(manifest.item_registry)) add(item.icon, `Icono de «${item.name}»`);
  for (const node of manifest.nodes) {
    const scene = node.title ?? node.node_id;
    const id = node.node_id;
    add(node.illustration?.asset, `Ilustración de ${scene}`, id);
    for (const e of node.acoustic_events) add(e.asset, `Sonido «${e.label ?? e.event_id}» en ${scene}`, id);
    add(node.gameplay_overlay?.on_success.play_sfx, `Sonido de acierto en ${scene}`, id);
    add(node.gameplay_overlay?.on_failure.play_sfx, `Sonido de fallo en ${scene}`, id);
    if (node.gameplay_overlay?.type === 'room_search' && typeof node.gameplay_overlay.parameters.image === 'string') add(node.gameplay_overlay.parameters.image, `Habitación para registrar en ${scene}`, id);
    add(node.screenless_mode?.voice_over_asset, `Narración de ${scene}`, id);
    add(node.screenless_mode?.foley_bed, `Fondo sonoro de ${scene} (sin pantalla)`, id);
  }
  return list;
}

export function assetUsages(manifest: StoryManifest): AssetUsages {
  const usages: AssetUsages = new Map();
  for (const { path, where } of assetUsageList(manifest)) usages.set(path, [...(usages.get(path) ?? []), where]);
  return usages;
}

/**
 * Avisos de exportación por cada uso de un archivo que no existe (decisión §4.3 de docs/11: avisa,
 * no bloquea). Nombran la escena para poder ir a ella, como el resto de diagnósticos.
 */
export function missingAssetIssues(manifest: StoryManifest, missing: ReadonlySet<string>): ManifestIssue[] {
  return assetUsageList(manifest)
    .filter((usage) => missing.has(usage.path))
    .map((usage) => ({
      severity: 'warning' as const,
      code: 'missing_asset',
      path: usage.path,
      message: `${usage.where}: falta el archivo «${usage.path.split('/').pop()}»; sonará un tono de prueba o se verá un marcador.`,
      ...(usage.nodeId ? { nodeId: usage.nodeId } : {}),
    }));
}

export const AUDIO_EXTENSIONS = ['ogg', 'opus', 'mp3', 'wav', 'flac', 'm4a'] as const;
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'] as const;
/** Límite por archivo (los proyectos deben seguir siendo ligeros y portátiles). */
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;

export function assetFolderFor(fileName: string): 'audio' | 'images' | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return 'audio';
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return 'images';
  return null;
}

/** Ruta interna segura y única para un archivo aportado: «Gotera Fría.WAV» → `assets/audio/gotera_fria.wav`. */
export function assetPathFor(fileName: string, taken: Iterable<string>): string | null {
  const folder = assetFolderFor(fileName);
  if (!folder) return null;
  const ext = fileName.split('.').pop()!.toLowerCase();
  const base =
    fileName
      .replace(/\.[^.]+$/, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'recurso';
  const used = new Set(taken);
  let candidate = `assets/${folder}/${base}.${ext}`;
  for (let n = 2; used.has(candidate); n++) candidate = `assets/${folder}/${base}_${n}.${ext}`;
  return candidate;
}

export function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif',
  };
  return map[ext] ?? 'application/octet-stream';
}
