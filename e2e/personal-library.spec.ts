import { expect, test } from '@playwright/test';
import { personalLibraryJourney } from './helpers/personalLibrary';
test('bibliotecas personales: perfil, autoguardado, búsqueda, copias y borrado seguro', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?obra=bienvenida'); await expect(page.getByTestId('writing-canvas')).toBeVisible();
  await personalLibraryJourney(page, '', async name => { await page.screenshot({path:testInfo.outputPath(`${name}.png`)}); });
  expect(errors).toEqual([]);
});
test('Mis obras y Mis recursos caben en una pantalla móvil', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/?obra=bienvenida');
  await page.getByTestId('open-works').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('dialog').getByTestId('modal-close').click(); await page.getByTestId('open-personal-resources').click();
  await expect(page.getByTestId('resources-empty')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
