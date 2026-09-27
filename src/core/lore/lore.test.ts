import { beforeEach, describe, expect, it } from 'vitest';
import { createSqlJsDriver } from './sqljsDriver';
import { LoreGraph } from './LoreGraph';
import { ContinuitySupervisor, findMentions } from './continuity';
import { seedFromManifest } from './manifestSeed';
import { validateManifest } from '../manifest';
import { sampleManifest } from '@/runtime/__fixtures__/sample';

async function graph() {
  return LoreGraph.open(await createSqlJsDriver());
}

/** Lore de ejemplo: Pedro, el revólver confiscado en la comisaría y la llave en el pozo. */
async function noir() {
  const g = await graph();
  await g.upsertMany([
    { id: 'pedro', category: 'character', name: 'Pedro', attributes: { aliases: ['el inspector'] } },
    { id: 'lucia', category: 'character', name: 'Lucía' },
    { id: 'revolver', category: 'item', name: 'revólver' },
    { id: 'llave_bronce', category: 'item', name: 'llave de bronce' },
    { id: 'ganzua', category: 'item', name: 'ganzúa' },
    { id: 'comisaria', category: 'location', name: 'la comisaría' },
    { id: 'pozo', category: 'location', name: 'el pozo' },
    { id: 'molino', category: 'location', name: 'el molino' },
  ]);
  await g.recordEvents([
    { timestamp: 1000, subject: 'revolver', action: 'acquired', object: 'pedro' },
    { timestamp: 1100, subject: 'ganzua', action: 'acquired', object: 'pedro' },
    { timestamp: 1200, subject: 'llave_bronce', action: 'lost', location: 'pozo', description: 'Cae al pozo' },
    { timestamp: 2000, subject: 'revolver', action: 'confiscated', object: 'comisaria' },
    { timestamp: 3000, subject: 'lucia', action: 'dies', location: 'molino' },
    { timestamp: 3000, subject: 'pedro', action: 'moved_to', location: 'molino' },
  ]);
  await g.addEdge({ source: 'pedro', target: 'lucia', relationship: 'afinidad', weight: 0.8, timestamp: 500 });
  return g;
}

describe('LoreGraph', () => {
  let g: LoreGraph;
  beforeEach(async () => {
    g = await noir();
  });

  it('crea el esquema con búsqueda de texto completo', () => {
    expect(['fts5', 'fts4']).toContain(g.fullText);
  });

  it('guarda y recupera entidades con atributos JSON', async () => {
    const pedro = await g.getEntity('pedro');
    expect(pedro?.attributes.aliases).toEqual(['el inspector']);
    expect(await g.updateEntity('pedro', { attributes: { edad: 41 }, status_flags: { herido: true } })).toBe(true);
    const updated = await g.getEntity('pedro');
    expect(updated?.attributes).toEqual({ aliases: ['el inspector'], edad: 41 });
    expect(updated?.status_flags.herido).toBe(true);
    expect(await g.updateEntity('nadie', {})).toBe(false);
  });

  it('rechaza categorías inválidas (restricción CHECK)', async () => {
    await expect(g.upsertEntity({ id: 'x', category: 'dragon' as never, name: 'x' })).rejects.toThrow();
  });

  it('busca sin distinguir acentos', async () => {
    expect((await g.search('revolver')).map((e) => e.id)).toEqual(['revolver']);
    expect((await g.search('inspector')).map((e) => e.id)).toEqual(['pedro']);
    expect(await g.search('   ')).toEqual([]);
  });

  it('consulta vecinos y aristas ponderadas', async () => {
    const [result] = await g.query('pedro');
    expect(result?.relations[0]?.entity.id).toBe('lucia');
    expect(result?.relations[0]?.edge.weight).toBeCloseTo(0.8);
    expect(await g.neighbors('lucia', { direction: 'out' })).toEqual([]);
    expect((await g.query('Lucía', 'afinidad'))[0]?.relations).toHaveLength(1);
  });

  it('deriva el estado temporal de las entidades', async () => {
    expect((await g.stateAt('revolver', 1500)).holder).toBe('pedro');
    expect((await g.stateAt('revolver', 2500)).holder).toBe('comisaria');
    expect((await g.stateAt('lucia', 2999)).alive).toBe(true);
    expect((await g.stateAt('lucia')).alive).toBe(false);
    expect((await g.stateAt('llave_bronce')).intact).toBe(false);
    expect((await g.stateAt('pedro')).location).toBe('molino');
    expect((await g.inventoryOf('pedro', 2500)).map((i) => i.id)).toEqual(['ganzua']);
  });

  it('mantiene la integridad referencial (poda en cascada)', async () => {
    expect(await g.removeEntity('lucia')).toBe(true);
    expect(await g.edgesOf('pedro')).toEqual([]);
    expect(await g.eventsFor('lucia')).toEqual([]);
    expect((await g.integrityCheck()).ok).toBe(true);
    await expect(g.addEdge({ source: 'pedro', target: 'fantasma', relationship: 'x' })).rejects.toThrow();
  });

  it('gestiona banderas', async () => {
    await g.setFlag('alarma_desactivada', true, 3);
    expect(await g.flags()).toEqual({ alarma_desactivada: 'true' });
    await g.clearFlag('alarma_desactivada');
    expect(await g.flags()).toEqual({});
  });

  it('produce subgrafos y métricas', async () => {
    const all = await g.subgraph();
    expect(all.nodes).toHaveLength(8);
    expect(all.edges).toHaveLength(1);
    expect((await g.subgraph({ center: 'pedro' })).nodes.map((n) => n.id).sort()).toEqual(['lucia', 'pedro']);
    expect(await g.counts()).toMatchObject({ nodes: 8, edges: 1, events: 6, byCategory: { character: 2, item: 3, location: 3 } });
  });

  it('se serializa y se reabre desde los bytes (lore_graph.db)', async () => {
    const bytes = g.exportBytes();
    expect(bytes?.byteLength).toBeGreaterThan(0);
    const reopened = await LoreGraph.open(await createSqlJsDriver({ data: bytes }));
    expect((await reopened.getEntity('pedro'))?.name).toBe('Pedro');
    expect((await reopened.search('ganzua')).length).toBe(1);
  });

  it('se siembra desde el manifiesto', async () => {
    const fresh = await graph();
    await seedFromManifest(fresh, validateManifest(sampleManifest()).manifest);
    const counts = await fresh.counts();
    expect(counts.byCategory).toMatchObject({ character: 2, item: 1, scene: 4 });
    expect((await fresh.neighbors('sancho')).map((n) => n.entity.id)).toEqual(['scene:consola']);
    expect((await fresh.edgesOf('scene:inicio', { relationship: 'leads_to', direction: 'out' })).length).toBe(3);
  });
});

describe('ContinuitySupervisor', () => {
  let g: LoreGraph;
  let supervisor: ContinuitySupervisor;
  beforeEach(async () => {
    g = await noir();
    supervisor = new ContinuitySupervisor(g);
  });

  it('detecta un objeto confiscado (doc 02: el revólver de Pedro)', async () => {
    const result = await supervisor.validate({ timestamp: 2500, actor: 'pedro', verb: 'use', object: 'revolver' });
    expect(result.valid).toBe(true); // advertencia, no bloqueo
    expect(result.issues[0]?.code).toBe('item_not_held');
    expect(result.issues[0]?.message).toContain('fue confiscado por la comisaría');
  });

  it('detecta un objeto perdido y sugiere alternativas del inventario (doc 04 §5.3)', async () => {
    const result = await supervisor.validate({ timestamp: 2500, actor: 'pedro', verb: 'use', object: 'llave_bronce' });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.message).toBe('Nota de continuidad: llave de bronce se perdió en el beat 1 (el pozo).');
    expect(result.issues[0]?.suggestion).toContain('ganzúa');
  });

  it('detecta personajes muertos que actúan', async () => {
    const result = await supervisor.validate({ timestamp: 3500, actor: 'lucia', verb: 'speak' });
    expect(result.issues[0]?.code).toBe('dead_actor');
    expect((await supervisor.validate({ timestamp: 2000, actor: 'lucia', verb: 'speak' })).valid).toBe(true);
  });

  it('detecta conflictos de paradero y requisitos', async () => {
    const result = await supervisor.validate({ timestamp: 3500, actor: 'pedro', verb: 'act', location: 'comisaria', requiredFlags: ['puerta_abierta'] });
    expect(result.issues.map((i) => i.code)).toEqual(['location_conflict', 'missing_flag']);
  });

  it('avisa de entidades desconocidas', async () => {
    const result = await supervisor.validate({ timestamp: 1, actor: 'nadie', verb: 'act' });
    expect(result.issues[0]?.code).toBe('unknown_entity');
  });

  it('analiza prosa y localiza el fragmento a subrayar', async () => {
    const text = 'Llovía sobre el molino. Pedro extrajo el revólver de su abrigo. Lucía sonrió desde la puerta.';
    const issues = await supervisor.analyzeText(text, 3500);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('item_not_held');
    expect(codes).toContain('dead_actor');
    const revolver = issues.find((i) => i.code === 'item_not_held')!;
    expect(text.slice(revolver.range!.start, revolver.range!.end)).toBe('revólver');
  });

  it('no confunde un recuerdo con una acción', async () => {
    const issues = await supervisor.analyzeText('Pedro recordaba cómo Lucía sonrió aquel verano.', 3500);
    expect(issues.filter((i) => i.code === 'dead_actor')).toEqual([]);
  });

  it('encuentra menciones por alias respetando límites de palabra', async () => {
    const entities = await g.listEntities();
    const mentions = findMentions('El inspector miró el pozo. Pedrosa no es Pedro.', entities);
    expect(mentions.map((m) => m.entity.id)).toEqual(['pedro', 'pozo', 'pedro']);
  });

  it('valida en menos de 50 ms con 1.000 entidades y 5.000 aristas', async () => {
    const big = await graph();
    const entities = Array.from({ length: 1000 }, (_, i) => ({
      id: `e${i}`,
      category: (i % 4 === 0 ? 'character' : i % 4 === 1 ? 'item' : i % 4 === 2 ? 'location' : 'mystery') as 'character',
      name: `Entidad ${i}`,
    }));
    await big.upsertMany(entities);
    await big.addEdges(Array.from({ length: 5000 }, (_, i) => ({ source: `e${i % 1000}`, target: `e${(i * 7 + 3) % 1000}`, relationship: i % 2 ? 'afinidad' : 'causa', weight: (i % 10) / 10, timestamp: i })));
    await big.recordEvents(Array.from({ length: 1500 }, (_, i) => ({ timestamp: i * 10, subject: `e${(i * 4 + 1) % 1000}`, action: 'acquired' as const, object: `e${(i * 4) % 1000}` })));
    await big.recordEvent({ timestamp: 20000, subject: 'e1', action: 'destroyed' });
    const s = new ContinuitySupervisor(big);
    await s.validate({ timestamp: 30000, actor: 'e0', verb: 'use', object: 'e5' }); // calentamiento
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await s.validate({ timestamp: 30000, actor: `e${(i * 4) % 1000}`, verb: 'use', object: `e${(i * 4 + 1) % 1000}`, location: 'e2' });
      times.push(r.elapsedMs);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)]).toBeLessThan(10);
    expect(times.at(-1)).toBeLessThan(50);
  });
});
