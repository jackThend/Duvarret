/** Obra original y mínima para verificar una instalación, sin clips precocinados. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ManifestEditor } from '../src/core/agent/manifestEditor';
import { StoryManifestSchema, validateManifest } from '../src/core/manifest';
import { createMeta } from '../src/core/project';
import { AssetRegistry } from '../src/core/assets/registry';

const root = resolve(process.argv[2] ?? (() => { throw new Error('Indica una carpeta nueva para la obra de prueba.'); })());
mkdirSync(dirname(root), { recursive: true });
mkdirSync(root, { recursive: false });
for (const dir of ['manifest', 'assets', 'manuscript/raw', 'manuscript/beats', 'knowledge']) mkdirSync(join(root, dir), { recursive: true });
const editor = new ManifestEditor(StoryManifestSchema.parse({ metadata: { title: 'La semilla de prueba' }, nodes: [] }));
assert.deepEqual(editor.patchManifest({
  metadata: { title: 'La semilla de prueba', author: 'Duvarret', language: 'es', version: '1.0.0', license: 'CC0-1.0' },
  initial_state: { start_node: 'semilla' },
}), []);
assert.deepEqual(editor.patchNode('semilla', {
  title: 'Una ventana', text_payload: 'Elisa dejó una semilla junto a la ventana. Al amanecer, una hoja diminuta buscaba el sol.',
  screenless_mode: { narration_text: 'Elisa dejó una semilla junto a la ventana. Al amanecer, una hoja diminuta buscaba el sol.', voice_prompts: [] },
  navigation: { is_ending: true },
}).issues, []);
const valid = validateManifest(editor.current);
assert.equal(valid.pristine, true);
assert.ok(!editor.integrity().some(issue => issue.severity === 'error'));
writeFileSync(join(root, 'manifest/story_manifest.json'), JSON.stringify(valid.manifest, null, 2));
writeFileSync(join(root, 'project.duvarret.json'), JSON.stringify(createMeta({ title: 'La semilla de prueba', author: 'Duvarret', mode: 'taller' }), null, 2));
writeFileSync(join(root, 'assets/registry.json'), JSON.stringify(new AssetRegistry().toJSON(), null, 2));
console.log(root);
