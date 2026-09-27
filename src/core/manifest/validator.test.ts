import { describe, expect, it } from 'vitest';
import example from './__fixtures__/doc03-example.json';
import { validateManifest, validateManifestText } from './validator';

describe('validateManifest', () => {
  it('acepta un manifiesto correcto sin reparaciones', () => {
    const result = validateManifest(example);
    expect(result.pristine).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('asume z = 0 cuando el agente omite la coordenada', () => {
    const result = validateManifest({
      metadata: { title: 'x' },
      nodes: [{ node_id: 'n1', acoustic_events: [{ event_id: 'e', asset: 'a.ogg', coordinates: { x: 2, y: 1 } }] }],
    });
    expect(result.manifest.nodes[0]!.acoustic_events[0]!.coordinates).toEqual({ x: 2, y: 1, z: 0 });
    const issue = result.issues.find((i) => i.path.endsWith('coordinates.z'));
    expect(issue?.code).toBe('missing_field');
    expect(issue?.nodeId).toBe('n1');
    expect(issue?.severity).toBe('warning');
  });

  it('nunca lanza ante entradas absurdas', () => {
    for (const bad of [null, undefined, 42, 'texto', [], { nodes: 'no' }, { metadata: 7, nodes: [null, 3] }]) {
      expect(() => validateManifest(bad)).not.toThrow();
    }
    const result = validateManifest(null);
    expect(result.issues[0]?.code).toBe('not_a_manifest');
    expect(result.manifest.nodes).toEqual([]);
    expect(result.manifest.metadata.title).toBe('Obra sin título');
  });

  it('marca directivas desconocidas y claves inventadas', () => {
    const result = validateManifest({
      metadata: { title: 'x' },
      nodes: [{ node_id: 'n1', typographic_engine: { layout_mode: 'vortex' }, run_script: 'rm -rf' }],
    });
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('unknown_directive');
    expect(codes).toContain('unknown_field');
    expect(result.manifest.nodes[0]!.typographic_engine!.layout_mode).toBe('standard');
  });

  it('asigna identificadores a escenas sin nombre sin perder su prosa', () => {
    const result = validateManifest({ metadata: { title: 'x' }, nodes: [{ text_payload: 'Había una vez' }] });
    expect(result.manifest.nodes[0]!.node_id).toBe('nodo_001');
    expect(result.manifest.nodes[0]!.text_payload).toBe('Había una vez');
    expect(result.issues.some((i) => i.code === 'generated_node_id')).toBe(true);
  });

  it('los mensajes no contienen jerga técnica', () => {
    const result = validateManifest({ metadata: 3, nodes: [{ node_id: 5, typographic_engine: 'x' }] });
    for (const issue of result.issues) {
      expect(issue.message).not.toMatch(/JSON|schema|parse|null|undefined|stack/i);
    }
  });
});

describe('validateManifestText', () => {
  it('recupera una obra vacía ante JSON ilegible', () => {
    const result = validateManifestText('{ "metadata": ');
    expect(result.issues[0]?.code).toBe('unreadable');
    expect(result.issues[0]?.severity).toBe('error');
    expect(result.manifest.nodes).toEqual([]);
  });

  it('parsea texto válido', () => {
    expect(validateManifestText(JSON.stringify(example)).pristine).toBe(true);
  });
});
