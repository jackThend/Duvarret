import { describe, expect, it } from 'vitest';
import example from './__fixtures__/doc03-example.json';
import { validateManifest } from './validator';
import { describeCondition, flagId, flagLabel, flowGraph, knownFlags, knownStats } from './navigation';
import { sampleManifest } from '@/runtime/__fixtures__/sample';

const sample = () => validateManifest(sampleManifest()).manifest;

describe('vocabulario de caminos', () => {
  it('reúne marcas y atributos de toda la obra', () => {
    expect(knownFlags(sample())).toEqual(['alarma_desactivada', 'alarma_disparada', 'entro_bunker', 'sereno', 'vio_rejilla']);
    expect(knownStats(sample())).toEqual(['percepcion', 'voluntad']);
    expect(knownFlags(validateManifest(example).manifest)).toContain('puerta_bunker_abierta');
  });

  it('traduce entre marcas y lenguaje llano', () => {
    expect(flagLabel('alarma_desactivada')).toBe('alarma desactivada');
    expect(flagId('  Alarma Desactivada! ')).toBe('alarma_desactivada');
    expect(flagId('Encontró la llave dorada')).toBe('encontro_la_llave_dorada');
  });

  it('describe las condiciones en español', () => {
    expect(describeCondition(undefined)).toBe('siempre');
    expect(describeCondition({ required_flag: 'vio_rejilla', required_item: 'llave' }, (id) => (id === 'llave' ? 'Llave de bronce' : id))).toBe(
      'si ya ocurrió «vio rejilla» y si lleva «Llave de bronce»',
    );
    expect(describeCondition({ forbidden_flag: 'huyo', min_stat: { stat: 'percepcion', value: 3 } })).toBe('si no ha ocurrido «huyo» y si su percepcion es al menos 3');
  });
});

describe('flowGraph', () => {
  it('ordena las escenas por distancia al inicio', () => {
    const graph = flowGraph(sample());
    const col = (id: string) => graph.nodes.find((n) => n.id === id)!.column;
    expect(graph.start).toBe('inicio');
    expect([col('inicio'), col('consola'), col('rejilla'), col('final')]).toEqual([0, 1, 1, 1]); // «Retroceder» lleva al final directamente
    expect(graph.edges.filter((e) => e.from === 'consola').map((e) => e.kind)).toEqual(['next', 'success', 'failure']);
    expect(graph.nodes.find((n) => n.id === 'final')!.ending).toBe(true);
  });

  it('señala escenas inalcanzables y caminos rotos', () => {
    const m = sampleManifest();
    m.nodes!.push({ node_id: 'huerfana', text_payload: 'Nadie llega aquí.' });
    m.nodes![2]!.navigation = { default_next_node: 'no_existe' };
    const graph = flowGraph(validateManifest(m).manifest);
    const orphan = graph.nodes.find((n) => n.id === 'huerfana')!;
    expect(orphan.reachable).toBe(false);
    expect(orphan.column).toBe(graph.columns - 1);
    expect(graph.edges.find((e) => e.to === 'no_existe')?.broken).toBe(true);
  });
});
