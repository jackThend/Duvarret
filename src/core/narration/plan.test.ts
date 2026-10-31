import { describe, expect, it } from 'vitest';
import { ManifestEditor } from '../agent/manifestEditor';
import { validateManifest } from '../manifest';
import { missingSpeech, speechTexts } from './script';
import { applyNarration, planNarration } from './plan';

const work = () => validateManifest({ metadata: { title: 'Breve' }, nodes: [{ node_id: 'inicio', title: 'Inicio', text_payload: 'Una luz.', is_ending: true }] }).manifest;

describe('plan de narración compartido', () => {
  it('graba también la numeración que queda cuando se ocultan caminos condicionales', () => {
    const manifest = validateManifest({ metadata: { title: 'Condiciones' }, nodes: [{ node_id: 'inicio', navigation: { choices: [
      {choice_text:'Secreto',target_node:'fin',condition:{required_flag:'llave'}},
      {choice_text:'Salir',target_node:'fin'},
    ] } }, {node_id:'fin',navigation:{is_ending:true}}] }).manifest;
    expect(speechTexts(manifest)).toContain('1: Salir.');
    expect(speechTexts(manifest)).toContain('2: Salir.');
  });
  it('la interpretación dulce regenera todo y luego reutiliza la misma voz y velocidad', async () => {
    const initial = await planNarration(work(), () => false);
    const natural = applyNarration(work(), initial);
    const sweet = await planNarration(natural, () => true, 'sweet');
    expect(sweet.speed).toBe(0.91);
    expect(sweet.clips[0]?.asset).not.toBe(initial.clips[0]?.asset);
    const next = applyNarration(natural, sweet);
    const reuse = await planNarration(next, () => true);
    expect(reuse.pending).toHaveLength(0);
    expect(reuse.delivery).toBe('sweet');
    expect(reuse.speed).toBe(0.91);
    expect(reuse.clips).toEqual(sweet.clips);
  });
  it('integra audio sobre el texto actual sin perder una edición hecha durante la síntesis', async () => {
    const original = work();
    const plan = await planNarration(original, () => false);
    const editor = new ManifestEditor(original);
    editor.patchNode('inicio', { text_payload: 'Una luz distinta.' });
    const merged = applyNarration(editor.current, plan);
    expect(merged.nodes[0]?.text_payload).toBe('Una luz distinta.');
    expect(merged.nodes[0]?.screenless_mode?.voice_over_asset).toBeUndefined();
    expect(missingSpeech(merged)).toContain('Una luz distinta.');
  });
  it('un WAV borrado vuelve a quedar pendiente aunque siga en el catálogo', async () => {
    const first = await planNarration(work(), () => false);
    const next = await planNarration(applyNarration(work(), first), () => false);
    expect(next.pending).toHaveLength(first.clips.length);
  });
});
