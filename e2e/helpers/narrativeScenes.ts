import type { Locator } from '@playwright/test';
import type { NarrativeType } from '../../src/core/gameplay/narrative';
async function set(root:Locator,id:string,value:number){await root.getByTestId(id).evaluate((el,v)=>{const input=el as HTMLInputElement;input.value=String(v);input.dispatchEvent(new Event('input',{bubbles:true}));},value);}
export async function solveNarrativeScene(root:Locator,type:NarrativeType){
  if(type==='radio_tuning'){await set(root,'radio-a',32);await set(root,'radio-b',71);}
  if(type==='memory_weave'){await root.getByTestId('memory-up-2').click();await root.getByTestId('memory-up-1').click();await root.getByTestId('memory-up-2').click();}
  if(type==='voice_negotiation'){for(const action of ['wait','speak','silence'])await root.getByTestId(`voice-${action}`).click();return;}
  if(type==='sound_trail'){for(const direction of ['right','front','left']){await root.getByTestId('trail-listen').click();await root.getByTestId(`trail-${direction}`).click();}return;}
  if(type==='surface_rubbing')for(let i=0;i<5;i++)await root.getByTestId('rubbing-stripe').click();
  if(type==='alchemy_mix'){await root.getByTestId('mix-add-0').click();await set(root,'mix-quantity',2);await root.getByTestId('mix-add-1').click();await set(root,'mix-quantity',1);await root.getByTestId('mix-add-2').click();await set(root,'mix-temperature',40);await set(root,'mix-rest',20);}
  if(type==='paper_fold'){await root.getByTestId('fold-horizontal').click();await root.getByTestId('fold-rotate').click();}
  if(type==='burden_balance')for(const [i,value] of [-1,0,1].entries())await root.getByTestId(`balance-${i}`).selectOption(String(value));
  if(type==='photo_development'){await set(root,'photo-exposure',50);await set(root,'photo-development',50);}
  if(type==='symbol_ritual')for(let i=0;i<3;i++)await root.getByTestId(`ritual-${i}`).click();
  await root.getByTestId('scene-confirm').click();
}
