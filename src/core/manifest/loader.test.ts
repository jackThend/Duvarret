import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import example from './__fixtures__/doc03-example.json';
import { loadManifest, loadManifestSync } from './loader';
import { buildManifestJsonSchema } from './jsonSchema';

describe('loader', () => {
  it('carga desde objeto y texto', () => {
    expect(loadManifestSync(example).pristine).toBe(true);
    expect(loadManifestSync(JSON.stringify(example)).manifest.nodes).toHaveLength(1);
  });

  it('adjunta el informe de integridad', () => {
    expect(loadManifestSync(example).integrity.some((i) => i.code === 'missing_node')).toBe(true);
  });

  it('carga desde URL con un fetcher inyectado', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(example) }));
    const result = await loadManifest('manifest/story_manifest.json', fetcher);
    expect(fetcher).toHaveBeenCalledWith('manifest/story_manifest.json');
    expect(result.pristine).toBe(true);
  });

  it('degrada con elegancia si la URL no existe', async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }));
    const result = await loadManifest(new URL('https://example.invalid/x.json'), fetcher);
    expect(result.issues[0]?.code).toBe('not_found');
    expect(result.manifest.nodes).toEqual([]);
  });
});

describe('JSON Schema', () => {
  it('se genera con los bloques de primer nivel del doc 03', () => {
    const schema = buildManifestJsonSchema() as { properties: Record<string, unknown>; required?: string[] };
    for (const key of ['metadata', 'global_settings', 'character_registry', 'item_registry', 'acoustic_environment', 'nodes']) {
      expect(schema.properties).toHaveProperty(key);
    }
    expect(schema.required).toEqual(expect.arrayContaining(['metadata', 'nodes']));
  });

  it('el archivo versionado está sincronizado con el esquema', () => {
    const file = JSON.parse(readFileSync(resolve(__dirname, '../../../schemas/story-manifest.schema.json'), 'utf8'));
    expect(file).toEqual(buildManifestJsonSchema());
  });
});
