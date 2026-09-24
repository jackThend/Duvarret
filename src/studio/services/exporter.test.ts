import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { compileFromStudio, loadPlayerRuntime, saveExport } from './exporter';
import { validateManifest } from '@/core/manifest';
import { welcomeManifest } from '../demo';

const files: Record<string, string> = {
  './player/files.json': JSON.stringify(['index.html', 'assets/player.js']),
  './player/index.html': '<html>reproductor</html>',
  './player/assets/player.js': 'console.log(1)',
  'obra/assets/audio/sfx/wind.ogg': 'OggS',
};
const fetcher = vi.fn(async (url: string) => (url in files ? new Response(files[url]) : new Response('', { status: 404 })));

describe('exportador del Studio', () => {
  it('carga el runtime empaquetado', async () => {
    const runtime = await loadPlayerRuntime(fetcher);
    expect([...runtime.keys()].sort()).toEqual(['assets/player.js', 'index.html']);
  });

  it('avisa si la instalación no trae el reproductor', async () => {
    await expect(loadPlayerRuntime(async () => new Response('', { status: 404 }))).rejects.toThrow('no incluye el reproductor');
  });

  it('compila con los assets del proyecto y descarga un zip', async () => {
    const manifest = validateManifest(welcomeManifest()).manifest;
    const result = await compileFromStudio({ manifest, assetBase: 'obra/', target: 'web', fetcher });
    expect(result.ok).toBe(true);
    expect(result.files.has('assets/audio/sfx/wind.ogg')).toBe(true);
    const clicks: string[] = [];
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    const saved = await saveExport(result, null);
    expect(saved.location).toBe('el-laberinto-de-la-mancha-web.zip');
    expect(clicks).toEqual(['el-laberinto-de-la-mancha-web.zip']);
    const blob = created.mock.calls[0]![0] as Blob;
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(strFromU8(zip['el-laberinto-de-la-mancha/index.html']!)).toContain('reproductor');
  });
});
