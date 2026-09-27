import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { accessibleScript, collectAssetReferences, compileBundle, rewriteAssetPaths, zipBundle, type FileMap } from './index';
import { validateManifest } from '../manifest';
import { sampleManifest } from '@/runtime/__fixtures__/sample';

const runtime: FileMap = new Map([
  ['index.html', new TextEncoder().encode('<html></html>')],
  ['assets/player.js', new Uint8Array(100)],
]);
const assets: Record<string, Uint8Array> = { 'assets/audio/drip.ogg': new Uint8Array(40), 'assets/images/sancho.webp': new Uint8Array(10) };
const readAsset = async (p: string) => assets[p] ?? null;

describe('collectAssetReferences', () => {
  it('encuentra todos los assets referenciados', () => {
    const m = validateManifest(sampleManifest()).manifest;
    expect(collectAssetReferences(m)).toEqual([
      'assets/audio/drip.ogg',
      'assets/audio/steps.ogg',
      'assets/images/sancho.webp',
      'assets/images/sancho_alarmed.webp',
    ]);
  });

  it('reescribe rutas tras optimizar', () => {
    const m = validateManifest(sampleManifest()).manifest;
    const out = rewriteAssetPaths(m, { 'assets/audio/drip.ogg': 'assets/audio/drip.opus' });
    expect(out.nodes[0]!.acoustic_events[0]!.asset).toBe('assets/audio/drip.opus');
  });
});

describe('compileBundle', () => {
  it('Web/PWA: runtime + manifiesto + assets + service worker', async () => {
    const result = await compileBundle({ manifest: sampleManifest(), readAsset, runtime }, 'web');
    expect(result.ok).toBe(true);
    expect([...result.files.keys()].sort()).toEqual(
      ['assets/audio/drip.ogg', 'assets/images/sancho.webp', 'assets/player.js', 'index.html', 'manifest.webmanifest', 'manifest/story_manifest.json', 'sw.js'].sort(),
    );
    expect(result.missingAssets).toEqual(['assets/audio/steps.ogg', 'assets/images/sancho_alarmed.webp']);
    const sw = strFromU8(result.files.get('sw.js')!);
    expect(sw).toContain('./manifest/story_manifest.json');
    expect(JSON.parse(strFromU8(result.files.get('manifest.webmanifest')!)).name).toBe('La Sombra del Molino');
    expect(result.stats.assetBytes).toBe(50);
  });

  it('bloquea la exportación si hay escenas rotas', async () => {
    const broken = sampleManifest();
    broken.nodes![0]!.navigation = { default_next_node: 'nada' };
    const result = await compileBundle({ manifest: broken, readAsset, runtime }, 'web');
    expect(result.ok).toBe(false);
    expect(result.blocking[0]?.code).toBe('missing_node');
    expect(result.files.size).toBe(0);
  });

  it('audio-drama: modo sin pantalla, guion accesible y lista de reproducción', async () => {
    const result = await compileBundle({ manifest: sampleManifest(), readAsset, runtime }, 'audio_drama');
    expect(result.manifest.global_settings.default_mode).toBe('audio_drama_screenless');
    expect(strFromU8(result.files.get('guion-accesible.txt')!)).toContain('Sancho Panza: ¡Esa consola es una trampa!');
    expect(strFromU8(result.files.get('lista.m3u')!)).toBe('#EXTM3U\nassets/audio/drip.ogg');
    expect(strFromU8(result.files.get('LEEME.txt')!)).toContain('NVDA');
  });

  it('nativo: sin service worker (el binario ya es offline)', async () => {
    const result = await compileBundle({ manifest: sampleManifest(), readAsset, runtime }, 'native');
    expect(result.files.has('sw.js')).toBe(false);
    expect(result.files.has('manifest/story_manifest.json')).toBe(true);
  });

  it('aplica el optimizador solo si reduce el tamaño', async () => {
    const result = await compileBundle(
      {
        manifest: sampleManifest(),
        readAsset,
        runtime,
        optimize: async (path, data) => (path.endsWith('.ogg') ? { path: path.replace('.ogg', '.opus'), data: data.slice(0, 10) } : { path, data: new Uint8Array(999) }),
      },
      'web',
    );
    expect(result.files.has('assets/audio/drip.opus')).toBe(true);
    expect(result.files.get('assets/images/sancho.webp')!.byteLength).toBe(10);
    expect(result.manifest.nodes[0]!.acoustic_events[0]!.asset).toBe('assets/audio/drip.opus');
  });

  it('empaqueta en zip', async () => {
    const result = await compileBundle({ manifest: sampleManifest(), readAsset, runtime }, 'web');
    const unzipped = unzipSync(zipBundle(result.files, 'obra'));
    expect(Object.keys(unzipped)).toContain('obra/index.html');
  });

  it('el guion accesible enumera las opciones', () => {
    const script = accessibleScript(validateManifest(sampleManifest()).manifest);
    expect(script).toContain('1. Seguir la brisa');
    expect(script).toContain('— Fin —');
  });
});
