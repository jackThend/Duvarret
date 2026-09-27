import { describe, expect, it } from 'vitest';
import { validateManifest } from '../manifest';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { assetFolderFor, assetPathFor, assetUsages, mimeFor } from './usages';

describe('assetUsages', () => {
  it('describe dónde se usa cada recurso', () => {
    const m = validateManifest({ ...sampleManifest(), acoustic_environment: { ambience_bed: 'assets/audio/noche.wav' } }).manifest;
    const usages = assetUsages(m);
    expect(usages.get('assets/audio/noche.wav')).toEqual(['Ambiente de fondo de la obra']);
    expect(usages.get('assets/images/sancho_alarmed.webp')).toEqual(['Retrato de Sancho Panza (alarmed)']);
    expect(usages.get('assets/audio/drip.ogg')).toEqual(['Sonido «gotera» en El Pasillo']);
  });
});

describe('rutas de recursos aportados', () => {
  it('clasifica por tipo y genera rutas únicas y seguras', () => {
    expect(assetFolderFor('Gotera.WAV')).toBe('audio');
    expect(assetFolderFor('retrato.webp')).toBe('images');
    expect(assetFolderFor('guion.pdf')).toBeNull();
    expect(assetPathFor('Gotera Fría.WAV', [])).toBe('assets/audio/gotera_fria.wav');
    expect(assetPathFor('gotera fria.wav', ['assets/audio/gotera_fria.wav'])).toBe('assets/audio/gotera_fria_2.wav');
    expect(assetPathFor('../../x.png', [])).toBe('assets/images/x.png');
    expect(assetPathFor('notas.txt', [])).toBeNull();
    expect(mimeFor('a.svg')).toBe('image/svg+xml');
  });
});
