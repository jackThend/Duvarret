import type { StoryManifest } from '../manifest';

const isLocal = (p: string | undefined): p is string => !!p && !/^(https?:|data:|blob:)/.test(p);

/** Todas las rutas de assets referenciadas por el manifiesto (para empaquetar solo lo necesario). */
export function collectAssetReferences(manifest: StoryManifest): string[] {
  const refs = new Set<string>();
  const add = (p: string | undefined) => {
    if (isLocal(p)) refs.add(p.replace(/^\.\//, ''));
  };
  add(manifest.acoustic_environment.ambience_bed);
  for (const c of Object.values(manifest.character_registry)) {
    Object.values(c.sprites).forEach(add);
    add(c.voice_profile?.locution_sample);
  }
  for (const item of Object.values(manifest.item_registry)) add(item.icon);
  for (const node of manifest.nodes) {
    add(node.illustration?.asset);
    node.acoustic_events.forEach((e) => add(e.asset));
    add(node.gameplay_overlay?.on_success.play_sfx);
    add(node.gameplay_overlay?.on_failure.play_sfx);
    add(node.screenless_mode?.voice_over_asset);
    add(node.screenless_mode?.foley_bed);
  }
  return [...refs].sort();
}

/** Sustituye rutas de assets en todo el manifiesto (tras optimizarlos, p. ej. .wav → .ogg). */
export function rewriteAssetPaths(manifest: StoryManifest, mapping: Record<string, string>): StoryManifest {
  const json = JSON.stringify(manifest, (_key, value: unknown) => (typeof value === 'string' && mapping[value] ? mapping[value] : value));
  return JSON.parse(json) as StoryManifest;
}

export const MIME_TYPES: Record<string, string> = {
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
  json: 'application/json',
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  wasm: 'application/wasm',
};
