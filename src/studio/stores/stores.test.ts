import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useProjectStore, nodeFormats } from './project';
import { useStudioStore } from './studio';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { MemoryStorage } from '@/core/project';
import { parseManuscript } from '@/core/ingest/sceneParser';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

async function opened() {
  const project = useProjectStore();
  await project.open({ manifest: sampleManifest(), storage: new MemoryStorage() });
  return project;
}

describe('useProjectStore', () => {
  it('abre una obra, siembra el lore y selecciona la primera escena', async () => {
    const project = await opened();
    expect(project.selectedNodeId).toBe('inicio');
    expect(project.chapters[0]!.nodes).toHaveLength(4);
    expect((await project.lore!.counts()).byCategory.character).toBe(2);
    expect(nodeFormats(project.nodes[0]!)).toEqual(['ergodic', 'audio']);
    expect(nodeFormats(project.nodes[1]!)).toEqual(['visual_novel', 'gameplay']);
    expect(nodeFormats(project.nodes[2]!)).toEqual(['text']);
  });

  it('edita, deshace y rehace', async () => {
    const project = await opened();
    project.updateText('inicio', 'Nuevo texto.');
    expect(project.selectedNode!.text_payload).toBe('Nuevo texto.');
    expect(project.dirty).toBe(true);
    project.undo();
    expect(project.selectedNode!.text_payload).toContain('angosto');
    project.redo();
    expect(project.selectedNode!.text_payload).toBe('Nuevo texto.');
  });

  it('añade y elimina escenas manteniendo la navegación', async () => {
    const project = await opened();
    project.select('rejilla');
    const id = project.addNode();
    expect(project.selectedNodeId).toBe(id);
    expect(project.nodes.find((n) => n.node_id === 'rejilla')!.navigation.default_next_node).toBe(id);
    expect(project.nodes.find((n) => n.node_id === id)!.navigation.default_next_node).toBe('final');
    project.removeNode(id);
    expect(project.nodes.find((n) => n.node_id === 'rejilla')!.navigation.default_next_node).toBe('final');
    expect(project.canExport).toBe(true);
  });

  it('el radar reubica fuentes sonoras', async () => {
    const project = await opened();
    project.moveAcousticEvent('inicio', 'gotera', { x: -2, y: 0, z: 1 });
    expect(project.nodes[0]!.acoustic_events[0]!.coordinates).toEqual({ x: -2, y: 0, z: 1 });
  });

  it('detecta problemas de continuidad en la prosa', async () => {
    const project = await opened();
    await project.lore!.recordEvent({ timestamp: 500, subject: 'sobre_lacrado', action: 'destroyed' });
    project.updateText('inicio', 'Sancho Panza abrió el Sobre con Lacre Negro.');
    const issues = await project.analyzeContinuity('inicio');
    expect(issues[0]?.code).toBe('item_unavailable');
    expect(project.continuity.inicio).toHaveLength(1);
  });

  it('guarda y reabre desde el almacenamiento (incluido el lore)', async () => {
    const project = await opened();
    project.updateTitle('inicio', 'El Pasillo Húmedo');
    await project.lore!.upsertEntity({ id: 'molino', category: 'location', name: 'El Molino' });
    await project.save();
    expect(project.dirty).toBe(false);
    const storage = project.storage as MemoryStorage;
    expect(JSON.parse(storage.files.meta!).format).toBe('duvarret-project');
    setActivePinia(createPinia());
    const again = useProjectStore();
    await again.openFromStorage(storage);
    expect(again.nodes[0]!.title).toBe('El Pasillo Húmedo');
    expect((await again.lore!.getEntity('molino'))?.name).toBe('El Molino');
  });

  it('importa un manuscrito segmentado como escenas encadenadas', async () => {
    const project = useProjectStore();
    const text = `Capítulo I\n\n${'palabra '.repeat(400)}.\n\nCapítulo II\n\n${'palabra '.repeat(350)}.`;
    await project.importManuscript(parseManuscript(text), { title: 'Mi novela' });
    expect(project.manifest.metadata.title).toBe('Mi novela');
    expect(project.nodes).toHaveLength(2);
    expect(project.nodes[0]!.navigation.default_next_node).toBe(project.nodes[1]!.node_id);
    expect(project.nodes[1]!.navigation.is_ending).toBe(true);
    expect(project.meta.mode).toBe('exegesis');
  });
});

describe('useStudioStore', () => {
  it('propone Pitch Cards proactivas y las aplica al instante', async () => {
    const project = await opened();
    project.updateText('inicio', 'El pasillo angosto; las paredes aplastaban, no podía respirar, estrecho y encerrado.');
    const studio = useStudioStore();
    studio.refreshPitches();
    const card = studio.openPitches[0]!;
    expect(card.title).toBe('Estrechar la página');
    studio.adjustPitch(card.id, 0, 'parameters.column_width_rem', 20);
    expect(await studio.applyPitch(card.id)).toBe(true);
    expect(project.nodes[0]!.typographic_engine!.column_width_rem).toBe(20);
    expect(studio.lastPulse).toBe(card.id);
    expect(studio.openPitches).toHaveLength(0);
  });

  it('dialoga con el co-director local y genera una propuesta aplicable', async () => {
    const project = await opened();
    const studio = useStudioStore();
    project.select('rejilla');
    await studio.ask('Quiero que se escuche una gotera a la derecha a 3 metros');
    expect(studio.chat.map((c) => c.role)).toEqual(['author', 'director']);
    const card = studio.openPitches[0]!;
    expect(card.source).toBe('chat');
    expect(project.nodes.find((n) => n.node_id === 'rejilla')!.acoustic_events).toHaveLength(0); // aún no aplicada
    await studio.applyPitch(card.id);
    expect(project.nodes.find((n) => n.node_id === 'rejilla')!.acoustic_events[0]!.coordinates).toEqual({ x: 3, y: 0, z: 0 });
  });

  it('rota alternativas y descarta', async () => {
    await opened();
    const project = useProjectStore();
    project.updateText('inicio', 'El pasillo angosto y estrecho, encerrado. Oscuridad, sombra, tinieblas, penumbra y noche negra.');
    const studio = useStudioStore();
    studio.refreshPitches();
    const card = studio.openPitches[0]!;
    const before = card.title;
    expect(studio.alternative(card.id)).toBe(true);
    expect(studio.openPitches[0]!.title).not.toBe(before);
    studio.dismissPitch(studio.openPitches[0]!.id);
    expect(studio.openPitches).toHaveLength(0);
  });

  it('recuerda las preferencias y aplica el tema', async () => {
    const studio = useStudioStore();
    studio.theme = 'sepia';
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.dataset.theme).toBe('sepia');
    expect(JSON.parse(localStorage.getItem('duvarret:studio-settings')!).theme).toBe('sepia');
  });
});
