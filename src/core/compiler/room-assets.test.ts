import { describe, expect, it } from 'vitest';
import { validateManifest } from '../manifest';
import { collectAssetReferences } from './assets';
import { assetUsages } from '../assets/usages';

describe('imagen de un cuarto jugable', () => {
  it('se incluye en la exportación y en la comprobación de archivos ausentes', () => {
    const { manifest } = validateManifest({ metadata: { title: 'Cuarto' }, nodes: [{ node_id: 'cuarto', gameplay_overlay: { type: 'room_search', parameters: { image: 'assets/images/cuarto.svg' } }, navigation: { is_ending: true } }] });
    expect(collectAssetReferences(manifest)).toContain('assets/images/cuarto.svg');
    expect(assetUsages(manifest).get('assets/images/cuarto.svg')).toEqual(['Habitación para registrar en cuarto']);
  });
});
