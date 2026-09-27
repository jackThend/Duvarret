/**
 * Compilador interno de Duvarret (doc 02 §6):
 *  1. Valida el story_manifest.json (las escenas rotas bloquean la exportación).
 *  2. Empaqueta solo los assets referenciados (y opcionalmente los optimiza).
 *  3. Inyecta el manifiesto en el Runtime base.
 *  4. Genera la salida Web/PWA, el paquete de audio-drama o el escenario del binario nativo.
 */
import { zipSync, strToU8 } from 'fflate';
import { checkIntegrity, validateManifest, type ManifestIssue, type StoryManifest } from '../manifest';
import { collectAssetReferences } from './assets';

export type ExportTarget = 'web' | 'audio_drama' | 'native';

export const TARGET_LABELS: Record<ExportTarget, string> = {
  web: 'Web / aplicación instalable',
  audio_drama: 'Audio-drama accesible',
  native: 'Ejecutable de escritorio',
};

export type FileMap = Map<string, Uint8Array>;

export interface CompileInput {
  manifest: unknown;
  /** Lee un asset del proyecto (ruta relativa a la carpeta `.duvarret`). */
  readAsset: (path: string) => Promise<Uint8Array | null>;
  /** Archivos del Runtime base compilado (build del reproductor). */
  runtime: FileMap;
  /** Optimizador opcional de assets (p. ej. transcodificación a Ogg/WebP). */
  optimize?: (path: string, data: Uint8Array) => Promise<{ path: string; data: Uint8Array } | null>;
}

export interface CompileResult {
  ok: boolean;
  target: ExportTarget;
  blocking: ManifestIssue[];
  warnings: ManifestIssue[];
  missingAssets: string[];
  files: FileMap;
  manifest: StoryManifest;
  stats: { files: number; bytes: number; assetBytes: number; runtimeBytes: number };
}

const enc = (text: string) => strToU8(text);

const slug = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'obra';

export function workSlug(manifest: StoryManifest) {
  return slug(manifest.metadata.title);
}

function webManifest(m: StoryManifest) {
  return JSON.stringify(
    {
      name: m.metadata.title,
      short_name: m.metadata.title.slice(0, 24),
      description: m.metadata.description ?? `${m.metadata.title} — ${m.metadata.author}`,
      lang: m.metadata.language,
      start_url: './index.html',
      scope: './',
      display: 'standalone',
      background_color: m.global_settings.theme_palette.background,
      theme_color: m.global_settings.theme_palette.background,
      icons: [
        { src: 'icons/duvarret-256.png', sizes: '256x256', type: 'image/png' },
        { src: 'icons/duvarret-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    null,
    2,
  );
}

/** Service worker de precarga: la obra funciona sin conexión una vez abierta. */
function serviceWorker(files: string[], version: string) {
  return `// Duvarret — caché sin conexión de la obra (${version})
const CACHE = 'duvarret-${version}';
const FILES = ${JSON.stringify(['./', ...files.map((f) => `./${f}`)])};
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
`;
}

/** Guion accesible: la obra completa en texto, con sus opciones, para lectores de pantalla y braille. */
export function accessibleScript(m: StoryManifest): string {
  const lines = [`${m.metadata.title}`, `${m.metadata.author}`, '', 'Guion accesible del audio-drama.', ''];
  for (const node of m.nodes) {
    lines.push(`## ${node.title ?? node.node_id}`, '', node.screenless_mode?.narration_text ?? node.text_payload, '');
    const vn = node.visual_novel_overlay;
    if (vn?.enabled) {
      for (const l of vn.lines.length ? vn.lines : [{ speaker: vn.active_speaker, text: vn.dialogue_text }]) {
        if (l.text) lines.push(`${m.character_registry[l.speaker]?.name ?? l.speaker}: ${l.text}`);
      }
      lines.push('');
    }
    const prompt = node.screenless_mode?.voice_prompts[0];
    if (prompt?.spoken_prompt) lines.push(prompt.spoken_prompt);
    node.navigation.choices.forEach((c, i) => lines.push(`  ${i + 1}. ${c.choice_text}`));
    if (node.navigation.is_ending) lines.push('— Fin —');
    lines.push('');
  }
  return lines.join('\n');
}

export async function compileBundle(input: CompileInput, target: ExportTarget): Promise<CompileResult> {
  const validation = validateManifest(input.manifest);
  let manifest = validation.manifest;
  const integrity = checkIntegrity(manifest);
  const blocking = integrity.filter((i) => i.severity === 'error');
  const warnings = [...validation.issues, ...integrity.filter((i) => i.severity === 'warning')];
  const empty: CompileResult = {
    ok: false,
    target,
    blocking,
    warnings,
    missingAssets: [],
    files: new Map(),
    manifest,
    stats: { files: 0, bytes: 0, assetBytes: 0, runtimeBytes: 0 },
  };
  if (blocking.length) return empty;

  if (target === 'audio_drama') {
    manifest = {
      ...manifest,
      global_settings: { ...manifest.global_settings, default_mode: 'audio_drama_screenless', allow_screenless_toggle: true },
    };
  }

  const files: FileMap = new Map();
  let runtimeBytes = 0;
  for (const [path, data] of input.runtime) {
    if (target === 'native' && path === 'manifest.webmanifest') continue;
    files.set(path, data);
    runtimeBytes += data.byteLength;
  }

  // Assets referenciados (optimizados si hay optimizador).
  const missingAssets: string[] = [];
  const renames: Record<string, string> = {};
  let assetBytes = 0;
  for (const ref of collectAssetReferences(manifest)) {
    const data = await input.readAsset(ref).catch(() => null);
    if (!data) {
      missingAssets.push(ref);
      continue;
    }
    const optimized = input.optimize ? await input.optimize(ref, data).catch(() => null) : null;
    const out = optimized && optimized.data.byteLength < data.byteLength ? optimized : { path: ref, data };
    if (out.path !== ref) renames[ref] = out.path;
    files.set(out.path, out.data);
    assetBytes += out.data.byteLength;
  }
  if (Object.keys(renames).length) {
    const { rewriteAssetPaths } = await import('./assets');
    manifest = rewriteAssetPaths(manifest, renames);
  }

  files.set('manifest/story_manifest.json', enc(JSON.stringify(manifest)));

  if (target === 'web' || target === 'audio_drama') {
    files.set('manifest.webmanifest', enc(webManifest(manifest)));
    const version = `${workSlug(manifest)}-${manifest.metadata.version}-${files.size}`;
    files.set('sw.js', enc(serviceWorker([...files.keys()].filter((f) => f !== 'sw.js'), version)));
  }
  if (target === 'audio_drama') {
    files.set('guion-accesible.txt', enc(accessibleScript(manifest)));
    const audio = collectAssetReferences(manifest).filter((p) => /\.(ogg|opus|mp3|wav|flac)$/.test(p) && !missingAssets.includes(p));
    files.set('lista.m3u', enc(['#EXTM3U', ...audio.map((p) => renames[p] ?? p)].join('\n')));
    files.set(
      'LEEME.txt',
      enc(
        [
          `${manifest.metadata.title} — audio-drama accesible`,
          '',
          'Abre index.html en cualquier navegador y usa auriculares.',
          'Teclas: números para elegir, Espacio para continuar, R repetir, O opciones, I inventario, H ayuda, V hablar.',
          'Compatible con NVDA, JAWS y VoiceOver. El texto completo está en guion-accesible.txt.',
        ].join('\n'),
      ),
    );
  }

  const bytes = [...files.values()].reduce((s, f) => s + f.byteLength, 0);
  return {
    ok: true,
    target,
    blocking,
    warnings,
    missingAssets,
    files,
    manifest,
    stats: { files: files.size, bytes, assetBytes, runtimeBytes },
  };
}

export function zipBundle(files: FileMap, root = ''): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, data] of files) entries[root ? `${root}/${path}` : path] = data;
  return zipSync(entries, { level: 6 });
}
