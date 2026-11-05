import { describe, expect, it } from 'vitest';
import { ManifestEditor } from '../agent/manifestEditor';
import { validateManifest } from '../manifest';
import { configureVisualScene, setInventoryIllustration } from './authoring';
import { proceduralImage } from './procedural';
import { visualPrompt, VisualStyleSchema } from './style';
import { assetUsages } from '../assets/usages';
import { compileBundle, collectAssetReferences } from '../compiler';
import { DirectorOrchestrator } from '../agent/orchestrator';
import { LocalDirectorProvider } from '../agent/localDirector';
import { ToolRegistry } from '../agent/tools/registry';
import { DIRECTOR_TOOLS } from '../agent/tools/directorTools';

const manifest = () => validateManifest({ metadata: { title: 'La llave' }, nodes: [{ node_id: 'inicio', navigation: { is_ending: true } }] }).manifest;
const args = { node_id: 'inicio', image: 'assets/images/cuarto.svg', image_alt: 'Una cocina vacía', item_id: 'llave', item_label: 'Llave de cobre', item_image: 'assets/images/llave.svg' };

describe('dirección visual declarativa', () => {
  it('conserva salidas y concede el objeto con su propia imagen, sin entregarlo al editar', () => {
    const editor = new ManifestEditor(manifest());
    configureVisualScene(editor, args);
    editor.patchNode('inicio', { gameplay_overlay: { on_success: { grant_flags: ['encontrado'] } } });
    configureVisualScene(editor, { ...args, item_x: 15, item_y: 85 });
    expect(editor.current.item_registry.llave).toMatchObject({ name: 'Llave de cobre', icon: args.item_image });
    expect(editor.current.initial_state.inventory).toEqual([]);
    expect(editor.node('inicio')?.gameplay_overlay).toMatchObject({ parameters: { item_x: 15, item_y: 85 }, on_success: { grant_items: ['llave'], grant_flags: ['encontrado'] } });
  });
  it('rechaza imágenes externas, coordenadas inválidas y sustituir otro puzle', () => {
    const editor = new ManifestEditor(manifest());
    expect(() => configureVisualScene(editor, { ...args, item_x: 110 })).toThrow();
    expect(() => configureVisualScene(editor, { ...args, image: 'https://sitio/imagen.png' })).toThrow();
    expect(() => configureVisualScene(editor, { ...args, image: 'assets/images/../llave.svg' })).toThrow();
    editor.patchNode('inicio', { gameplay_overlay: { type: 'lockpick' } });
    expect(() => configureVisualScene(editor, args)).toThrow('otro puzle');
    expect(editor.current.item_registry.llave).toBeUndefined();
  });
  it('actualiza la misma imagen al cambiar un objeto utilizado por una búsqueda, también antigua', () => {
    const editor = new ManifestEditor(manifest()); configureVisualScene(editor, args);
    editor.patchNode('antigua', { gameplay_overlay: { type: 'room_search', parameters: { image: args.image }, on_success: { grant_items: ['llave'] } } });
    setInventoryIllustration(editor, 'llave', 'assets/images/otra-llave.png');
    expect(editor.current.item_registry.llave?.icon).toBe('assets/images/otra-llave.png');
    for (const node of editor.current.nodes) expect(node.gameplay_overlay?.parameters.item_image).toBe('assets/images/otra-llave.png');
    expect(editor.node('antigua')?.gameplay_overlay?.on_success.grant_items).toEqual(['llave']);
  });
  it.each(['web', 'audio_drama', 'native'] as const)('exporta fondo, objeto y entorno del puzle en %s', async target => {
    const editor = new ManifestEditor(manifest()); configureVisualScene(editor, args);
    editor.patchNode('inicio', { gameplay_overlay: { parameters: { artwork: 'assets/images/marco.svg' } } });
    expect(collectAssetReferences(editor.current)).toEqual([args.image, args.item_image, 'assets/images/marco.svg'].sort());
    expect(assetUsages(editor.current).has(args.item_image)).toBe(true);
    const image = proceduralImage('cuarto', 'background', VisualStyleSchema.parse({}));
    const result = await compileBundle({ manifest: editor.current, runtime: new Map([['index.html', new TextEncoder().encode('<html></html>')]]), readAsset: async () => image }, target);
    expect(result.ok).toBe(true);
    expect(result.missingAssets).toEqual([]);
    expect(result.files.has(args.image)).toBe(true); expect(result.files.has(args.item_image)).toBe(true);
  });
  it('escapa el texto del autor en SVG y diferencia fondo, objeto y estilo', () => {
    const profile = VisualStyleSchema.parse({ style: 'comic', atmosphere: 'analog', notes: 'cobre y verde' });
    const svg = new TextDecoder().decode(proceduralImage('<script>alert(1)</script>', 'object', profile));
    expect(svg).not.toContain('<script>'); expect(svg).toContain('&lt;script&gt;');
    expect(visualPrompt('Cocina', 'background', profile)).toContain('sin el objeto');
    expect(visualPrompt('Llave', 'object', profile)).toContain('fondo liso blanco');
    expect(visualPrompt('Retrato', 'portrait', profile)).toContain('Cómic');
    expect(visualPrompt('Retrato', 'portrait', profile)).toContain('cobre y verde');
    expect(proceduralImage('Guardiana asustada', 'portrait', profile)).not.toEqual(proceduralImage('Guardiana neutral', 'portrait', profile));
  });
  it('expone al asistente una herramienta validada y orientación sin activar servicios', async () => {
    const editor = new ManifestEditor(manifest());
    const result = await new ToolRegistry(DIRECTOR_TOOLS).execute('setVisualSearchScene', args, { editor });
    expect(result.mutates).toBe(true); expect(result.error).toBeUndefined();
    const turn = await new DirectorOrchestrator({ provider: new LocalDirectorProvider() }).run({ message: 'Quiero ilustrar la escena con otro estilo visual', manifest: manifest(), context: { nodeId: 'inicio' } });
    expect(turn.reply).toContain('Mis recursos');
    expect(turn.reply).toContain('Gemini');
    expect(turn.executions).toHaveLength(0);
  });
});
