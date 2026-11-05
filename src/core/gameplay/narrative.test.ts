import { describe, expect, it } from 'vitest';
import { NARRATIVE_SCENES, NARRATIVE_TYPES, defaultNarrativeParams, validateNarrativeParams } from './narrative';
import { checkIntegrity, validateManifest } from '../manifest';
import { compileBundle } from '../compiler';
import { ManifestEditor } from '../agent/manifestEditor';
import { ToolRegistry } from '../agent/tools/registry';
import { DIRECTOR_TOOLS } from '../agent/tools/directorTools';
import { suggestForBeat, interpretInstruction } from '../agent/localDirector';
import { speechTexts } from '../narration/script';
import { createPinia, setActivePinia } from 'pinia';
import { useStoryStore } from '@/runtime/stores/story';
import { ScreenlessController } from '@/runtime/screenless/ScreenlessController';
import { Announcer } from '@/runtime/screenless/announcer';

describe('contrato de escenas narrativas',()=>{
  it('no interpreta un grito como un rito ni un cuarto oscuro como un revelado',()=>{
    expect(interpretInstruction('Pon un grito detrás a 5 metros','inicio').some(c=>c.name==='mountSimulatedModule')).toBe(false);
    expect(suggestForBeat('inicio','Busqué con mi linterna en un cuarto oscuro hasta encontrar el objeto.').some(p=>p.id.includes('photo_development'))).toBe(false);
  });
  it.each(NARRATIVE_TYPES)('%s se valida, se sugiere y no sustituye otra escena de forma proactiva',type=>{
    const scene=NARRATIVE_SCENES.find(s=>s.type===type)!;
    expect(()=>validateNarrativeParams(type,defaultNarrativeParams(type))).not.toThrow();
    expect(interpretInstruction(scene.title,'inicio').some(c=>c.arguments.module_type===type)).toBe(true);
    const node=validateManifest({nodes:[{node_id:'inicio',gameplay_overlay:{type:'lockpick'}}]}).manifest.nodes[0]!;
    expect(suggestForBeat('inicio',scene.title,{node}).some(s=>s.id===`inicio:${type}`)).toBe(false);
  });
  it('rechaza relaciones imposibles y bloquea su exportación',()=>{
    expect(()=>validateNarrativeParams('alchemy_mix',{ingredients:['A','B'],amounts:[1,2,3]})).toThrow();
    expect(()=>validateNarrativeParams('photo_development',{exposure_min:80,exposure_max:30})).toThrow();
    expect(()=>validateNarrativeParams('burden_balance',{loads:['A','B'],weights:[2,5],values:[4,5],balance_tolerance:0,minimum_value:8})).toThrow('Ningún reparto');
    const manifest=validateManifest({nodes:[{node_id:'inicio',gameplay_overlay:{type:'alchemy_mix',parameters:{ingredients:['A','B'],amounts:[1,2,3]}},navigation:{is_ending:true}}]}).manifest;
    expect(checkIntegrity(manifest).some(i=>i.code==='invalid_gameplay_parameters'&&i.severity==='error')).toBe(true);
  });
  it('el agente no sustituye un mecanismo ni acepta parámetros inválidos',async()=>{
    const registry=new ToolRegistry(DIRECTOR_TOOLS),editor=new ManifestEditor(validateManifest({nodes:[{node_id:'inicio',gameplay_overlay:{type:'lockpick'}}]}).manifest);
    const out=await registry.execute('mountSimulatedModule',{node_id:'inicio',module_type:'radio_tuning',config:{}},{editor});expect(out.error).toBe('tool_failed');expect(editor.node('inicio')?.gameplay_overlay?.type).toBe('lockpick');
    const invalid=await registry.execute('mountSimulatedModule',{node_id:'inicio',module_type:'radio_tuning',replace_existing:true,config:{target_a:0,target_b:0}},{editor});expect(invalid.error).toBe('tool_failed');expect(editor.node('inicio')?.gameplay_overlay?.type).toBe('lockpick');
  });
  it.each(NARRATIVE_TYPES)('%s adapta el audio-drama con decisiones escritas por el autor',type=>{
    setActivePinia(createPinia());const store=useStoryStore();
    store.load(validateManifest({nodes:[{node_id:'inicio',gameplay_overlay:{type,is_mandatory_to_advance:true,parameters:{...defaultNarrativeParams(type),audio_success_option:'Sostener la promesa',audio_failure_option:'Romper la promesa'},on_success:{grant_flags:['promesa']},on_failure:{grant_flags:['libertad']}},navigation:{is_ending:true}}]}).manifest);store.start();
    const controller=new ScreenlessController(store,new Announcer({speak:()=>{},cancel:()=>{}}));
    expect(controller.buildOptions().map(o=>o.label)).toEqual(['Sostener la promesa','Romper la promesa']);controller.announceOptions();controller.handleKey('2');
    expect(store.flags).toContain('libertad');expect(store.flags).not.toContain('promesa');controller.stop();
  });
  it.each(['web','audio_drama','native'] as const)('incluye las diez escenas y sus imágenes en %s',async target=>{
    const manifest=validateManifest({metadata:{title:'Diez acciones'},nodes:NARRATIVE_TYPES.map((type,i)=>({node_id:`n${i}`,gameplay_overlay:{type,parameters:{...defaultNarrativeParams(type),artwork:`assets/images/${type}.svg`}},navigation:i===9?{is_ending:true}:{default_next_node:`n${i+1}`}}))}).manifest;
    const result=await compileBundle({manifest,runtime:new Map([['index.html',new TextEncoder().encode('<html></html>')]]),readAsset:async()=>new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')},target);
    expect(result.ok).toBe(true);expect(result.missingAssets).toEqual([]);
    for(const type of NARRATIVE_TYPES)expect(result.files.has(`assets/images/${type}.svg`)).toBe(true);
    expect(speechTexts(manifest)).toContain('1: Aceptar el resultado previsto.');
    expect(speechTexts(manifest)).not.toContain('1: intentar resolver el enigma.');
  });
});
