import { solveNarrativeScene as solve } from './helpers/narrativeScenes';
import { expect,test } from '@playwright/test';
import { NARRATIVE_TYPES } from '../src/core/gameplay/narrative';
for(const type of NARRATIVE_TYPES)test(`${type}: autoría, prueba aislada, guardado y reproducción`,async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?obra=bienvenida');await expect(page.getByTestId('writing-canvas')).toBeVisible();
  await page.getByTestId('open-works').click();await page.getByTestId('mode-taller').check();await page.getByTestId('new-work-title').fill(`Prueba ${type}`);await page.getByTestId('create-work').click();
  await page.getByTestId('open-playable-scene').click();await page.getByTestId('playable-type').selectOption(type);
  await page.getByTestId('playable-success-text').fill(`La acción ${type} ha terminado.`);await page.getByTestId('playable-success-flags').fill(`hecho_${type}`);
  await page.getByTestId('playable-preview').click();const preview=page.getByTestId('playable-preview-stage');
  await preview.screenshot({path:testInfo.outputPath(`${type}.png`)});await solve(preview,type);
  await expect(page.getByTestId('playable-preview-result')).toContainText('Resultado previsto');
  await page.getByTestId('playable-save').click();await expect(page.getByTestId('playable-saved')).toContainText('guardados');await page.getByTestId('modal-close').click();
  await page.reload();await page.getByTestId('open-playable-scene').click();await expect(page.getByTestId('playable-type')).toHaveValue(type);await expect(page.getByTestId('playable-success-flags')).toHaveValue(`hecho_${type}`);await page.getByTestId('modal-close').click();
  if(type==='paper_fold'||type==='symbol_ritual'){await page.setViewportSize({width:390,height:844});await page.getByTestId('view-preview').click();}
  const runtime=page.getByTestId('live-preview');await solve(runtime,type);await expect(runtime.getByTestId('narrative-result')).toContainText(`La acción ${type} ha terminado.`);
  if(type==='paper_fold'||type==='symbol_ritual'){await runtime.screenshot({path:testInfo.outputPath(`${type}-movil.png`)});expect(await runtime.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}
  expect(errors).toEqual([]);
});
