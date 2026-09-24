/**
 * Completa el proyecto de la obra insignia: foley sintetizado, catálogo de procedencia,
 * grafo de lore con su línea temporal y manuscrito de referencia.
 *
 *   npm run flagship
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { validateManifest } from '../src/core/manifest';
import { AssetRegistry } from '../src/core/assets/registry';
import { createSqlJsDriver } from '../src/core/lore/sqljsDriver';
import { LoreGraph } from '../src/core/lore/LoreGraph';
import { seedFromManifest } from '../src/core/lore/manifestSeed';
import { synthesizeAll } from './synthesize-foley';

const ROOT = resolve(import.meta.dirname, '..');
const WORK = join(ROOT, 'works/el-corazon-delator.duvarret');

async function main() {
  execFileSync('python3', [join(ROOT, 'scripts/flagship_manifest.py'), join(WORK, 'manifest/story_manifest.json')], { stdio: 'inherit' });
  const manifest = validateManifest(JSON.parse(readFileSync(join(WORK, 'manifest/story_manifest.json'), 'utf8'))).manifest;

  synthesizeAll(join(WORK, 'assets/audio/sfx'));

  const registry = new AssetRegistry();
  const stamp = '2026-09-24T00:00:00.000Z';
  for (const file of readdirSync(join(WORK, 'assets/audio/sfx')).sort()) {
    registry.register({
      path: `assets/audio/sfx/${file}`,
      origin: 'synthetic',
      provider: 'duvarret-foley (síntesis procedimental determinista)',
      license: 'CC BY 4.0',
      prompt: `Foley «${file.replace('.wav', '')}» para El Corazón Delator`,
      created_at: stamp,
    });
  }
  const images = ['assets/images/ojo.svg', ...readdirSync(join(WORK, 'assets/images/characters')).map((f) => `assets/images/characters/${f}`), ...readdirSync(join(WORK, 'assets/images/items')).map((f) => `assets/images/items/${f}`)];
  for (const path of images.sort()) registry.register({ path, origin: 'author', author: 'Duvarret', license: 'CC BY 4.0', created_at: stamp });
  writeFileSync(join(WORK, 'assets/registry.json'), `${JSON.stringify(registry.toJSON(), null, 2)}\n`);

  // Lore: reparto, objetos, lugares y la causalidad del relato.
  const graph = await LoreGraph.open(await createSqlJsDriver());
  await seedFromManifest(graph, manifest);
  await graph.upsertMany([
    { id: 'dormitorio', category: 'location', name: 'el dormitorio del viejo' },
    { id: 'tablones', category: 'item', name: 'tablones del suelo', attributes: { aliases: ['las tablas', 'los tablones'] } },
    { id: 'ojo_buitre', category: 'mystery', name: 'el ojo de buitre', attributes: { aliases: ['el ojo'] } },
    { id: 'viejo', category: 'character', name: 'El anciano', attributes: { aliases: ['el viejo', 'el anciano'], location: 'dormitorio' } },
    { id: 'narrador', category: 'character', name: 'El narrador', attributes: { aliases: ['el narrador'] } },
  ]);
  const beat = (id: string) => (manifest.nodes.findIndex((n) => n.node_id === id) + 1) * 1000;
  await graph.recordEvents([
    { timestamp: beat('prologo'), subject: 'linterna_sorda', action: 'acquired', object: 'narrador' },
    { timestamp: beat('prologo'), subject: 'reloj_bolsillo', action: 'acquired', object: 'narrador' },
    { timestamp: beat('el_crimen') + 500, subject: 'viejo', action: 'dies', object: 'narrador', location: 'dormitorio', description: 'Asfixiado bajo la cama.' },
    { timestamp: beat('bajo_las_tablas') + 500, subject: 'viejo', action: 'moved_to', location: 'dormitorio', description: 'Oculto bajo tres tablones.' },
  ]);
  await graph.addEdges([
    { source: 'narrador', target: 'viejo', relationship: 'afecto', weight: 0.6, timestamp: beat('el_ojo') },
    { source: 'narrador', target: 'ojo_buitre', relationship: 'obsesion', weight: 1, timestamp: beat('el_ojo') },
    { source: 'viejo', target: 'ojo_buitre', relationship: 'posee', weight: 1, timestamp: 0 },
    { source: 'agente', target: 'narrador', relationship: 'sospecha', weight: 0.4, timestamp: beat('los_agentes') },
  ]);
  mkdirSync(join(WORK, 'knowledge'), { recursive: true });
  writeFileSync(join(WORK, 'knowledge/lore_graph.db'), graph.exportBytes()!);

  const md = [`# ${manifest.metadata.title}`, '', `*${manifest.metadata.author}*`, ''];
  for (const node of manifest.nodes) md.push(`## ${node.title ?? node.node_id}`, '', node.text_payload, '');
  mkdirSync(join(WORK, 'manuscript/raw'), { recursive: true });
  writeFileSync(join(WORK, 'manuscript/raw/el-corazon-delator.md'), md.join('\n'));

  const counts = await graph.counts();
  console.log(`✓ ${manifest.metadata.title}: ${manifest.nodes.length} escenas, ${registry.list().length} recursos, lore ${counts.nodes} entidades / ${counts.edges} relaciones / ${counts.events} eventos.`);
  if (!existsSync(join(WORK, 'project.duvarret.json'))) throw new Error('Falta project.duvarret.json');
}

void main();
