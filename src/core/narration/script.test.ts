import { describe, expect, it } from 'vitest';
import { ManifestEditor } from '../agent/manifestEditor';
import { validateManifest, checkIntegrity } from '../manifest';
import { sampleManifest } from '../../runtime/__fixtures__/sample';
import { missingSpeech, speechTexts, introductionText } from './script';

describe('voz persistida en una obra', () => {
  it('incluye títulos, prosa, caminos, diálogos y avisos sin duplicar menús enumerados', () => {
    const manifest = validateManifest(sampleManifest()).manifest;
    const texts = speechTexts(manifest).join(' ');
    expect(texts).toContain('El Pasillo');
    expect(texts).toContain('angosto');
    expect(texts).toContain('1: Seguir la brisa.');
    expect(texts).toContain('Sancho Panza:');
    expect(introductionText('1: Entrar. 2: Salir.')).toBe('');
  });

  it('una edición necesita grabación nueva y conserva la voz elegida al guardar', () => {
    const manifest = validateManifest(sampleManifest()).manifest;
    const editor = new ManifestEditor(manifest);
    editor.patchManifest({ global_settings: { narration_voice: {
      voice_id: 'kokoro:ef_dora', label: 'Dora',
      clips: speechTexts(manifest).map((text, i) => ({ text, asset: `assets/audio/${i}.wav` })),
    } } });
    expect(missingSpeech(editor.current)).toEqual([]);
    editor.patchNode('inicio', { title: 'Título editado' });
    expect(missingSpeech(editor.current)).toContain('Título editado');
    expect(checkIntegrity(editor.current).some(i => i.code === 'narration_outdated')).toBe(true);
    expect(validateManifest(editor.current).manifest.global_settings.narration_voice?.voice_id).toBe('kokoro:ef_dora');
  });
});
