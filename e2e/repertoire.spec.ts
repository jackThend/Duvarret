import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseScenePackage } from '../src/core/repertoire/package';

test('Repertorio comparte una escena con imagen entre dos bibliotecas independientes', async ({ page, browser }) => {
  const artwork = 'assets/images/fotografia.svg';
  const raw = JSON.stringify({
    format: 'duvarret-scene', version: 1, name: 'Fotografía del faro', tags: ['acantilado'],
    overlay: { type: 'photo_development', title: 'La fecha en la emulsión', parameters: { artwork, revealed_text: 'La fecha es 1912.' } },
    assets: { [artwork]: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="26" fill="orange"/></svg>').toString('base64') },
  });
  await page.goto('/?obra=bienvenida');
  await page.getByTestId('open-repertoire').click();
  await page.getByTestId('repertoire-import').setInputFiles({ name: 'faro.duvescena', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await expect(page.getByRole('status').filter({ hasText: 'Escena importada' })).toBeVisible();
  await page.getByTestId('repertoire-search').fill('acantilado');
  const entry = page.getByTestId('repertoire-entry').filter({ hasText: 'Fotografía del faro' });
  await entry.getByRole('button', { name: 'Favorita: Fotografía del faro' }).click();
  await page.reload();
  await page.getByTestId('open-repertoire').click();
  await page.getByTestId('repertoire-favorites').click();
  await expect(entry).toHaveCount(1);
  await entry.getByRole('button').first().click();
  const download = page.waitForEvent('download');
  await page.getByTestId('repertoire-export').click();
  const file = await (await download).path();
  expect(file).toBeTruthy();
  const bytes = await readFile(file!);
  expect(parseScenePackage(bytes.toString()).assets[artwork]).toBeTruthy();

  const second = await browser.newContext();
  try {
    const target = await second.newPage();
    await target.goto('/?obra=bienvenida');
    await target.getByTestId('open-repertoire').click();
    await target.getByTestId('repertoire-import').setInputFiles({ name: 'faro.duvescena', mimeType: 'application/json', buffer: bytes });
    await target.getByTestId('repertoire-entry').filter({ hasText: 'Fotografía del faro' }).getByRole('button').first().click();
    await expect.poll(() => target.getByTestId('repertoire-dialog').locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(64);
    const confirmation = target.getByLabel('Sustituir la mecánica de la escena actual');
    if (await confirmation.count()) await confirmation.check();
    await target.getByTestId('repertoire-use').click();
    await expect(target.getByTestId('playable-type')).toHaveValue('photo_development');
    await target.getByTestId('config-revealed_text').fill('La fecha es 1913.');
    await target.getByTestId('playable-save').click();
    await expect(target.getByTestId('playable-saved')).toBeVisible();
    await target.getByTestId('modal-close').click();
    const player = target.getByTestId('live-preview');
    for (const field of ['photo-exposure', 'photo-development']) {
      await player.getByTestId(field).evaluate((el: HTMLInputElement) => {
        el.value = '50';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await player.getByTestId('scene-confirm').click();
    await expect(player.getByTestId('narrative-result')).toContainText('La fecha es 1913.');
    await target.getByTestId('open-repertoire').click();
    await target.getByText('Compartir la escena guardada en la obra').click();
    const capturedDownload = target.waitForEvent('download');
    await target.getByRole('button', { name: 'Exportar escena actual' }).click();
    const captured = parseScenePackage(await readFile((await (await capturedDownload).path())!, 'utf8'));
    expect(captured.overlay.parameters.revealed_text).toBe('La fecha es 1913.');
    expect(Object.keys(captured.assets)).toHaveLength(1);
    await target.getByTestId('modal-close').click();
    await target.getByTestId('agent-input').fill('Sugiere del Repertorio una escena de acantilado');
    await target.getByTestId('agent-send').click();
    await expect(target.getByTestId('repertoire-entry').filter({ hasText: 'Fotografía del faro' })).toBeVisible();
  } finally {
    await second.close();
  }
});
