import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { MemoryStorage } from '@/core/project';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import PathsEditor from './PathsEditor.vue';
import PathsMap from './PathsMap.vue';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

async function opened(select = 'inicio') {
  const project = useProjectStore();
  await project.open({ manifest: sampleManifest(), storage: new MemoryStorage(), withLore: false });
  project.select(select);
  return project;
}

const nav = (id: string) => useProjectStore().nodes.find((n) => n.node_id === id)!.navigation;

describe('caminos de la escena (store)', () => {
  it('sustituye los caminos por completo, limpia condiciones vacías y se puede deshacer', async () => {
    const project = await opened();
    project.updateNavigation('inicio', {
      default_next_node: undefined,
      choices: [{ choice_text: '  ', target_node: 'final', grant_flags: ['huyo', 'huyo', ''], condition: { required_flag: '' } }],
      is_ending: false,
    });
    expect(nav('inicio').default_next_node).toBeUndefined();
    expect(nav('inicio').choices).toEqual([{ choice_text: 'Continuar', target_node: 'final', grant_flags: ['huyo'] }]);
    expect(project.dirty).toBe(true);
    project.undo();
    expect(nav('inicio').default_next_node).toBe('consola');
    expect(nav('inicio').choices).toHaveLength(2);
  });

  it('crea una escena suelta sin reencaminar la de referencia', async () => {
    const project = await opened();
    const id = project.addNode('inicio', { link: false, select: false, title: 'La cripta' });
    expect(nav('inicio').default_next_node).toBe('consola');
    expect(project.selectedNodeId).toBe('inicio');
    const created = project.nodes.find((n) => n.node_id === id)!;
    expect(created).toMatchObject({ title: 'La cripta', navigation: { is_ending: true } });
    expect(project.nodes[1]!.node_id).toBe(id);
  });
});

describe('PathsEditor', () => {
  it('muestra la continuación, las elecciones y sus condiciones en lenguaje llano', async () => {
    await opened();
    const w = mount(PathsEditor);
    expect((w.get('[data-testid="paths-next"]').element as HTMLSelectElement).value).toBe('consola');
    expect(w.findAll('[data-testid^="choice-editor-"]')).toHaveLength(2);
    expect(w.get('[data-testid="choice-editor-0"]').text()).toContain('si ya ocurrió «vio rejilla»');
    expect(w.get('[data-testid="choice-editor-1"]').text()).toContain('si no ha ocurrido «entro bunker»');
  });

  it('añade una elección, la dirige a una escena nueva y edita su texto', async () => {
    const project = await opened('rejilla');
    const w = mount(PathsEditor);
    await w.get('[data-testid="choice-add"]').trigger('click');
    expect(nav('rejilla').choices).toHaveLength(1);
    await w.get('[data-testid="choice-text"]').setValue('Asomarse al pozo');
    expect(nav('rejilla').choices[0]!.choice_text).toBe('Asomarse al pozo');
    const before = project.nodes.length;
    await w.get('[data-testid="choice-target"]').setValue('__nueva__');
    expect(project.nodes).toHaveLength(before + 1);
    const created = project.nodes.find((n) => n.title === 'Nueva escena')!;
    expect(nav('rejilla').choices[0]!.target_node).toBe(created.node_id);
    expect(nav('rejilla').default_next_node).toBe('final');
    expect(project.selectedNodeId).toBe('rejilla');
    await w.get('[data-testid="choice-remove"]').trigger('click');
    expect(nav('rejilla').choices).toHaveLength(0);
  });

  it('añade y quita condiciones y marcas', async () => {
    await opened();
    const w = mount(PathsEditor);
    const card = () => w.get('[data-testid="choice-editor-1"]');
    await card().get('[data-testid="condition-add"]').trigger('click');
    await card().get('[data-testid="condition-flag"]').setValue('Alarma desactivada');
    await card().get('[data-testid="condition-confirm"]').trigger('click');
    expect(nav('inicio').choices[1]!.condition).toEqual({ forbidden_flag: 'entro_bunker', required_flag: 'alarma_desactivada' });

    await card().get('[data-testid="condition-add"]').trigger('click');
    await card().get('[data-testid="condition-kind"]').setValue('min_stat');
    await card().get('[data-testid="condition-stat"]').setValue('voluntad');
    await card().get('[data-testid="condition-value"]').setValue(4);
    await card().get('[data-testid="condition-confirm"]').trigger('click');
    expect(nav('inicio').choices[1]!.condition!.min_stat).toEqual({ stat: 'voluntad', value: 4 });

    const chips = card().findAll('[data-testid="condition-chip"]');
    expect(chips).toHaveLength(3);
    for (const chip of card().findAll('[data-testid="condition-chip"]')) await chip.get('button').trigger('click');
    expect(nav('inicio').choices[1]!.condition).toBeUndefined();

    const mark = card().get('[data-testid="mark-input"]');
    await mark.setValue('Huyó a tiempo');
    await mark.trigger('keydown', { key: 'Enter' });
    expect(nav('inicio').choices[1]!.grant_flags).toEqual(['huyo_a_tiempo']);
    expect(card().get('[data-testid="mark-chip"]').text()).toContain('huyo a tiempo');
    await card().get('[data-testid="mark-chip"] button').trigger('click');
    expect(nav('inicio').choices[1]!.grant_flags).toEqual([]);
  });

  it('marca la escena como final y retira la continuación', async () => {
    await opened('consola');
    const w = mount(PathsEditor);
    await w.get('[data-testid="paths-ending"]').setValue(true);
    expect(nav('consola')).toMatchObject({ is_ending: true });
    expect(nav('consola').default_next_node).toBeUndefined();
    expect(w.get('[data-testid="paths-puzzle"]').text()).toContain('si se resuelve');
    await w.get('[data-testid="paths-ending"]').setValue(false);
    await w.get('[data-testid="paths-next"]').setValue('rejilla');
    expect(nav('consola')).toMatchObject({ is_ending: false, default_next_node: 'rejilla' });
  });

  it('abre el mapa de caminos', async () => {
    await opened();
    const w = mount(PathsEditor);
    await w.get('[data-testid="open-paths-map"]').trigger('click');
    expect(useStudioStore().pathsMapOpen).toBe(true);
  });
});

describe('PathsMap', () => {
  it('dibuja las escenas y sus caminos, avisa de huérfanas y rotas y abre la escena pulsada', async () => {
    const project = await opened();
    const w = mount(PathsMap);
    expect(w.findAll('[data-testid^="flow-node-"]')).toHaveLength(4);
    expect(w.findAll('[data-testid="flow-edge"]').length).toBeGreaterThan(4);
    expect(w.find('[data-testid="paths-ok"]').exists()).toBe(true);

    project.addNode('final', { link: false, select: false, title: 'Epílogo perdido' });
    project.updateNavigation('rejilla', { default_next_node: 'final', choices: [{ choice_text: 'Al vacío', target_node: 'nada', grant_flags: [] }], is_ending: false });
    await w.vm.$nextTick();
    expect(w.get('[data-testid="paths-warnings"]').text()).toContain('«Epílogo perdido»');
    expect(w.get('[data-testid="paths-warnings"]').text()).toContain('1 camino que lleva');
    expect(w.findAll('[data-testid="flow-broken"]')).toHaveLength(1);

    await w.get('[data-testid="flow-node-consola"]').trigger('click');
    expect(project.selectedNodeId).toBe('consola');
    expect(w.emitted('close')).toHaveLength(1);
  });
});
