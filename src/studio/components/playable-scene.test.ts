import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { createPinia,setActivePinia } from 'pinia';
import { mount,type VueWrapper } from '@vue/test-utils';
import { NARRATIVE_TYPES } from '@/core/gameplay/narrative';
import { validateManifest } from '@/core/manifest';
import { MemoryStorage } from '@/core/project';
import { useProjectStore } from '../stores/project';
import PlayableSceneDialog from './PlayableSceneDialog.vue';
import { vi } from 'vitest';

const wrappers: VueWrapper[]=[];
beforeEach(async()=>{localStorage.clear();setActivePinia(createPinia());await useProjectStore().open({manifest:validateManifest({nodes:[{node_id:'inicio',navigation:{is_ending:true}}]}).manifest,storage:new MemoryStorage(),withLore:false});});
afterEach(()=>wrappers.splice(0).forEach(w=>w.unmount()));
describe('configuración por el escritor',()=>{
  it.each(NARRATIVE_TYPES)('%s guarda reglas, resultados y permite deshacer',async type=>{
    const project=useProjectStore(),w=mount(PlayableSceneDialog,{props:{initialType:type}});wrappers.push(w);
    await w.get('[data-testid="playable-success-flags"]').setValue('hallazgo, confianza');
    await w.get('[data-testid="playable-failure-flags"]').setValue('otro_camino');
    await w.get('[data-testid="playable-save"]').trigger('click');
    await vi.waitFor(()=>expect(w.get('[data-testid="playable-saved"]').text()).toContain('guardados'));
    expect(project.selectedNode?.gameplay_overlay).toMatchObject({type,on_success:{grant_flags:['hallazgo','confianza']},on_failure:{grant_flags:['otro_camino']}});
    const saved=await project.storage.load();expect(saved?.manifest).toBeDefined();
    project.undo();expect(project.selectedNode?.gameplay_overlay).toBeUndefined();
  });
  it('rechaza una receta inválida sin cambiar la escena',async()=>{
    const project=useProjectStore(),before=project.manifest,w=mount(PlayableSceneDialog,{props:{initialType:'alchemy_mix'}});wrappers.push(w);
    await w.get('[data-testid="config-amounts"]').setValue('1,2');await w.get('[data-testid="playable-save"]').trigger('click');
    expect(w.get('[data-testid="playable-error"]').text()).toContain('cantidad');expect(project.manifest).toBe(before);
  });
  it('exige confirmar la sustitución y conserva ambos resultados',async()=>{
    const project=useProjectStore();project.patchNode('inicio',{gameplay_overlay:{type:'lockpick',on_success:{grant_flags:['abierta']},on_failure:{grant_flags:['rota']}}});
    const w=mount(PlayableSceneDialog,{props:{initialType:'paper_fold'}});wrappers.push(w);
    await w.get('[data-testid="playable-save"]').trigger('click');expect(w.get('[data-testid="playable-error"]').text()).toContain('Confirma');
    expect(project.selectedNode?.gameplay_overlay?.type).toBe('lockpick');await w.get('[data-testid="playable-replace"]').setValue(true);await w.get('[data-testid="playable-save"]').trigger('click');
    await vi.waitFor(()=>expect(project.selectedNode?.gameplay_overlay?.type).toBe('paper_fold'));
    expect(project.selectedNode?.gameplay_overlay?.on_success.grant_flags).toEqual(['abierta']);expect(project.selectedNode?.gameplay_overlay?.on_failure.grant_flags).toEqual(['rota']);
  });
});
