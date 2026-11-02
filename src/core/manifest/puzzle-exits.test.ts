import { describe, expect, it } from 'vitest';
import { checkIntegrity, validateManifest } from './index';

describe('salidas tras un enigma obligatorio', () => {
  it('acepta elecciones desbloqueadas por la marca de éxito', () => {
    const { manifest } = validateManifest({ metadata: { title: 'El sello' }, nodes: [
      { node_id: 'sello', gameplay_overlay: { type: 'cipher_lock', is_mandatory_to_advance: true, on_success: { grant_flags: ['abierto'] } }, navigation: { choices: [{ choice_text: 'Cruzar', target_node: 'fin', condition: { required_flag: 'abierto' } }] } },
      { node_id: 'fin', navigation: { is_ending: true } },
    ] });
    expect(checkIntegrity(manifest).filter(i => i.code === 'dead_end')).toEqual([]);
    manifest.nodes[0]!.navigation.choices = [];
    expect(checkIntegrity(manifest).filter(i => i.code === 'dead_end')).toHaveLength(1);
  });
});
