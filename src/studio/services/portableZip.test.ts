import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { compileBundle } from '@/core/compiler';
import { validateManifest } from '@/core/manifest';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { savePortableZip } from './exporter';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@/core/lore/tauriDriver', () => ({ isTauri: () => true }));

describe('ZIP nativo listo para compartir', () => {
  it('incluye programa y obra y lee la ruta relativa del binario exportado', async () => {
    const manifest = validateManifest(sampleManifest()).manifest;
    const result = await compileBundle({ manifest, runtime: new Map(), readAsset: async () => new Uint8Array([1]) }, 'native');
    let written: number[] = [];
    invoke.mockImplementation(async (command, args) => {
      if (command === 'export_player_binary') return `C:\\obra\\${args.relativeDir}\\${args.name}.exe`;
      if (command === 'project_read_bytes') {
        expect(args.relative).not.toMatch(/^[A-Z]:/);
        return [77, 90, 1, 2];
      }
      if (command === 'project_write_bytes') { written = args.contents; return; }
      throw new Error(`Comando inesperado: ${command}`);
    });
    const saved = await savePortableZip(result, 'C:\\obra');
    expect(saved.location).toMatch(/-escritorio.zip$/);
    const zip = unzipSync(new Uint8Array(written));
    const executable = Object.keys(zip).find(path => path.endsWith('.exe'))!;
    expect([...zip[executable]!]).toEqual([77, 90, 1, 2]);
    const packed = Object.keys(zip).find(path => path.endsWith('/obra/manifest/story_manifest.json'))!;
    expect(JSON.parse(strFromU8(zip[packed]!)).nodes).toHaveLength(manifest.nodes.length);
  });
});
