import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { NARRATIVE_TYPES, defaultNarrativeParams, type NarrativeType } from '@/core/gameplay/narrative';
import { validateManifest } from '@/core/manifest';
import { useStoryStore } from '../stores/story';
import ModuleSandbox from './ModuleSandbox.vue';
import NarrativeScene from './NarrativeScene.vue';

vi.mock('./narrativeSound', () => ({ narrativeSound: () => ({ play: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() }) }));
const wrappers: VueWrapper[] = [];
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => wrappers.splice(0).forEach(w => w.unmount()));
const click = async (w: VueWrapper, id: string) => { await w.get(`[data-testid="${id}"]`).trigger('click'); };
const set = async (w: VueWrapper, id: string, value: number) => { await w.get(`[data-testid="${id}"]`).setValue(String(value)); };

async function succeed(type: NarrativeType, w: VueWrapper) {
  if (type === 'radio_tuning') { await set(w,'radio-a',32); await set(w,'radio-b',71); }
  if (type === 'memory_weave') { await click(w,'memory-up-2'); await click(w,'memory-up-1'); await click(w,'memory-up-2'); }
  if (type === 'voice_negotiation') { await click(w,'voice-wait'); await click(w,'voice-speak'); await click(w,'voice-silence'); return; }
  if (type === 'sound_trail') { for (const d of ['right','front','left']) { await click(w,'trail-listen'); await click(w,`trail-${d}`); } return; }
  if (type === 'surface_rubbing') for (let i = 0; i < 5; i++) await click(w,'rubbing-stripe');
  if (type === 'alchemy_mix') { await click(w,'mix-add-0'); await set(w,'mix-quantity',2); await click(w,'mix-add-1'); await set(w,'mix-quantity',1); await click(w,'mix-add-2'); await set(w,'mix-temperature',40); await set(w,'mix-rest',20); }
  if (type === 'paper_fold') { await click(w,'fold-horizontal'); await click(w,'fold-rotate'); }
  if (type === 'burden_balance') { await set(w,'balance-0',-1); await set(w,'balance-1',0); await set(w,'balance-2',1); }
  if (type === 'photo_development') { await set(w,'photo-exposure',50); await set(w,'photo-development',50); }
  if (type === 'symbol_ritual') for (let i = 0; i < 3; i++) await click(w,`ritual-${i}`);
  await click(w,'scene-confirm');
}

describe('diez escenas narrativas con consecuencias', () => {
  it.each(NARRATIVE_TYPES)('%s: se juega, concede el resultado una sola vez y mantiene la lectura', async type => {
    const manifest = validateManifest({ metadata: { title: 'Prueba' }, item_registry: { pista: { name:'Pista' }, coste: {name:'Recuerdo'} }, initial_state: { inventory:['coste'] }, nodes: [{ node_id:'inicio', gameplay_overlay: { type, parameters:defaultNarrativeParams(type), on_success: {grant_flags:['resuelto'],grant_items:['pista'],consume_items:['coste']}, on_failure:{grant_flags:['alternativo']} }, navigation:{is_ending:true} }] }).manifest;
    const story = useStoryStore(); story.load(manifest); story.start();
    const w = mount(ModuleSandbox,{props:{overlay:manifest.nodes[0]!.gameplay_overlay!},attrs:{onResolve:(ok:boolean)=>story.resolvePuzzle(ok)}}); wrappers.push(w);
    await succeed(type,w);
    expect(w.emitted('resolve')).toEqual([[true]]);
    expect(story.flags).toContain('resuelto'); expect(story.inventory).toEqual(['pista']);
    story.resolvePuzzle(false); expect(story.flags).not.toContain('alternativo');
    expect(w.get('[data-testid="narrative-result"]').text()).toContain('continuar');
  });
  it.each(NARRATIVE_TYPES)('%s: error o alternativa no concede el resultado previsto', async type => {
    const w = mount(NarrativeScene,{props:{kind:type,parameters:{...defaultNarrativeParams(type),max_attempts:1}}}); wrappers.push(w);
    if (type === 'voice_negotiation') for (let i=0;i<3;i++) await click(w,'voice-speak');
    else if (type === 'sound_trail') { await click(w,'trail-listen'); await click(w,'trail-left'); }
    else if (type === 'burden_balance') { for(let i=0;i<3;i++) await set(w,`balance-${i}`,0); await click(w,'scene-confirm'); }
    else if (type === 'symbol_ritual') await click(w,'ritual-break');
    else await click(w,'scene-confirm');
    expect(w.emitted('failure')).toHaveLength(1); expect(w.emitted('success')).toBeUndefined();
    expect(w.get('fieldset').attributes('disabled')).toBeDefined();
  });
  it.each(NARRATIVE_TYPES)('%s: abandonar bloquea los controles sin otorgar una resolución posterior', async type => {
    const manifest=validateManifest({nodes:[{node_id:'uno',gameplay_overlay:{type,parameters:defaultNarrativeParams(type)}}]}).manifest;
    const w=mount(ModuleSandbox,{props:{overlay:manifest.nodes[0]!.gameplay_overlay!}});wrappers.push(w);
    await click(w,'sandbox-giveup'); expect(w.emitted('resolve')).toEqual([[false]]);
    expect(w.get('.scene-controls').attributes('disabled')).toBeDefined();
  });
  it('el calco fuerte deteriora el original y un fallo fotográfico no revela el hallazgo', async () => {
    const rubbing=mount(NarrativeScene,{props:{kind:'surface_rubbing',parameters:defaultNarrativeParams('surface_rubbing')}});wrappers.push(rubbing);
    await set(rubbing,'rubbing-pressure',3);for(let i=0;i<3;i++)await click(rubbing,'rubbing-stripe');
    expect(rubbing.emitted('failure')).toHaveLength(1);
    const photo=mount(NarrativeScene,{props:{kind:'photo_development',parameters:{...defaultNarrativeParams('photo_development'),max_attempts:1,revealed_text:'Secreto imposible'}}});wrappers.push(photo);await click(photo,'scene-confirm');
    expect(photo.text()).not.toContain('Secreto imposible');
  });
  it('una configuración corrupta muestra un diagnóstico sin resolver el mecanismo', async () => {
    const w=mount(NarrativeScene,{props:{kind:'alchemy_mix',parameters:{ingredients:['uno','dos'],amounts:[1,2,3]}}});wrappers.push(w);
    expect(w.get('[role="alert"]').text()).toContain('corrección');expect(w.get('fieldset').attributes('disabled')).toBeDefined();expect(w.emitted('success')).toBeUndefined();
  });
});
