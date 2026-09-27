import { expect, test, type Page } from '@playwright/test';

async function openStudio(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?obra=bienvenida');
  await expect(page.getByTestId('writing-canvas')).toBeVisible();
}

test.describe('Duvarret Studio (E2E)', () => {
  test('diseño tripartito sin errores en consola', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openStudio(page);
    await expect(page.getByTestId('left-panel')).toBeVisible();
    await expect(page.getByTestId('live-preview')).toBeVisible();
    await expect(page.getByTestId('acoustic-radar')).toBeVisible();
    // Los paneles respetan las proporciones 20/45/35 aproximadas.
    const widths = await page.locator('.dv-workspace > *').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    const total = widths.reduce((a, b) => a + b, 0);
    expect(widths[0]! / total).toBeGreaterThan(0.15);
    expect(widths[1]! / total).toBeGreaterThan(0.4);
    expect(errors).toEqual([]);
  });

  test('lo que se escribe aparece en la vista previa (< 200 ms)', async ({ page }) => {
    await openStudio(page);
    const prose = page.getByTestId('prose');
    await prose.fill('');
    const latency = await page.evaluate(async () => {
      const textarea = document.querySelector<HTMLTextAreaElement>('[data-testid="prose"]')!;
      const preview = document.querySelector('[data-testid="live-preview"]')!;
      const started = performance.now();
      textarea.value = 'Llovía sobre la Mancha como si el cielo tuviera prisa.';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return await new Promise<number>((resolve) => {
        const check = () => (preview.textContent?.includes('como si el cielo tuviera prisa') ? resolve(performance.now() - started) : requestAnimationFrame(check));
        check();
      });
    });
    expect(latency).toBeLessThan(200);
  });

  test('co-director: pide un sonido, aplica la propuesta y aparece en el radar', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('agent-input').fill('Quiero una respiración en la oreja izquierda');
    await page.getByTestId('agent-send').click();
    await expect(page.getByTestId('chat-director')).toContainText('Propuesta lista');
    await page.getByTestId('pitch-apply').first().click();
    await expect(page.getByTestId('radar-respiracion')).toBeVisible();
    await expect(page.getByTestId('beat-molinos')).toContainText('🎧');
  });

  test('el radar se arrastra con el ratón', async ({ page }) => {
    await openStudio(page);
    const source = page.getByTestId('radar-viento').locator('circle');
    const box = (await source.boundingBox())!;
    const svg = (await page.getByTestId('acoustic-radar').locator('svg').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(svg.x + svg.width * 0.85, svg.y + svg.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('radar-viento')).toHaveAttribute('aria-label', /a la derecha/);
  });

  test('temas editoriales y formato móvil', async ({ page }) => {
    await openStudio(page);
    const nordicBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.getByTestId('open-settings').click();
    await page.getByTestId('theme-sepia').check();
    await page.getByTestId('modal-close').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
    const sepiaBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(nordicBg).toBe('rgb(12, 14, 18)');
    expect(sepiaBg).toBe('rgb(244, 238, 225)');
    await page.getByTestId('preview-mobile').click();
    await expect(page.locator('.dv-preview-frame')).toHaveClass(/is-mobile/);
  });

  test('importa un manuscrito Markdown y lo divide en escenas', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('open-import').click();
    const chapter = (n: number) => `## Capítulo ${n}\n\n${'La noche caía sobre el molino y nadie decía palabra. '.repeat(40)}`;
    await page.getByTestId('import-file').setInputFiles({ name: 'molino.md', mimeType: 'text/markdown', buffer: Buffer.from(`# El molino\n\n${chapter(1)}\n\n${chapter(2)}`) });
    await expect(page.getByTestId('import-beats').locator('li')).toHaveCount(2);
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('work-title')).toHaveValue('El molino');
    await expect(page.getByTestId('live-preview')).toContainText('La noche caía sobre el molino');
  });

  test('importa un manuscrito de Word (.docx) y un libro electrónico (.epub)', async ({ page }) => {
    await openStudio(page);
    for (const file of ['la-llanura.docx', 'la-llanura.epub']) {
      await page.getByTestId('open-import').click();
      await page.getByTestId('import-file').setInputFiles(`src/core/ingest/__fixtures__/${file}`);
      await expect(page.getByTestId('import-beats').locator('li')).toHaveCount(2);
      await page.getByTestId('import-confirm').click();
      await expect(page.getByTestId('work-title')).toHaveValue('La Llanura');
      await expect(page.getByTestId('left-panel')).toContainText('Capítulo segundo');
      await expect(page.getByTestId('live-preview')).toContainText('El viento soplaba sobre la llanura');
    }
  });

  test('modo sin pantalla accesible por teclado', async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press('Control+Shift+A');
    const stage = page.getByTestId('screenless-stage');
    await expect(stage).toBeVisible();
    await expect(page.getByTestId('live-polite')).not.toBeEmpty();
    await stage.press('Escape');
    await expect(stage).toBeHidden();
  });

  test('guarda la obra y la recupera al recargar', async ({ page }) => {
    await page.goto('/?obra=bienvenida');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('writing-canvas')).toBeVisible();
    await page.getByTestId('node-title').fill('Los gigantes');
    await page.getByTestId('node-title').blur();
    await page.getByTestId('save').click();
    await expect(page.getByTestId('dirty')).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('node-title')).toHaveValue('Los gigantes');
  });
});

test.describe('Obra insignia: El Corazón Delator', () => {
  test('abre por defecto con su lore, sus retratos y su foley', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', (r) => r.status() >= 400 && failed.push(r.url()));
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
    await expect(page.getByTestId('work-title')).toHaveValue('El Corazón Delator');
    await expect(page.getByTestId('left-panel')).toContainText('III. Siete medianoches');
    await page.getByTestId('beat-el_latido').click();
    await expect(page.getByTestId('live-preview').locator('.dv-heartbeat')).toBeVisible();
    await expect(page.getByTestId('radar-corazon_viejo')).toBeVisible();
    await page.getByTestId('open-graph').click();
    await expect(page.getByTestId('graph-node-ojo_buitre')).toBeVisible();
    await page.getByTestId('modal-close').click();
    await page.getByTestId('beat-octava_noche').click();
    await page.getByTestId('live-preview').getByTestId('skip-reading').click();
    await expect(page.getByTestId('vn-avatar')).toHaveAttribute('src', /viejo_temeroso\.svg/);
    expect(failed).toEqual([]);
  });

  test('la continuidad avisa si el viejo habla después de morir', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
    await page.getByTestId('beat-las_cuatro').click();
    await page.getByTestId('prose').fill('Cuando terminé eran las cuatro. El viejo sonrió desde la puerta.');
    await expect(page.getByTestId('continuity-notes')).toContainText('El anciano murió');
    await expect(page.getByTestId('continuity-mark')).toHaveText('El viejo');
  });
});

test.describe('Exportación a un clic', () => {
  test('descarga la obra como aplicación web instalable', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
    await expect(page.getByTestId('work-title')).toHaveValue('El Corazón Delator');
    await page.getByTestId('open-export').click();
    await expect(page.getByTestId('export-ready')).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-web').click()]);
    expect(download.suggestedFilename()).toBe('el-corazon-delator-web.zip');
    await expect(page.getByTestId('export-message')).toContainText('el-corazon-delator-web.zip');
  });
});

test.describe('Obras: crear, cambiar y recordar', () => {
  test('crea una obra en blanco, cambia a otra y vuelve sin perder nada', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('iniciado')) {
        localStorage.clear();
        sessionStorage.setItem('iniciado', '1');
      }
    });
    await page.goto('/');
    await expect(page.getByTestId('work-title')).toHaveValue('El Corazón Delator');
    // Un cambio sin guardar en la obra de ejemplo…
    await page.getByTestId('node-title').fill('I. Nervioso, siempre');
    await page.getByTestId('node-title').blur();

    await page.getByTestId('open-works').click();
    await page.getByTestId('new-work-title').fill('Cuaderno de la Mancha');
    await page.getByTestId('new-work-author').fill('Elena');
    await page.getByTestId('create-work').click();
    await expect(page.getByTestId('work-title')).toHaveValue('Cuaderno de la Mancha');
    await expect(page.getByTestId('left-panel')).toContainText('Primera escena');
    await page.getByTestId('prose').fill('Amanecía sobre la llanura.');
    await page.getByTestId('save').click();

    // …se guardó al cambiar: la obra de ejemplo sigue en «Obras recientes» con el cambio.
    await page.getByTestId('open-works').click();
    const recents = page.getByTestId('recent-works');
    await expect(recents).toContainText('El Corazón Delator');
    await recents.locator('li', { hasText: 'El Corazón Delator' }).getByTestId('open-recent').click();
    await expect(page.getByTestId('work-title')).toHaveValue('El Corazón Delator');
    await expect(page.getByTestId('node-title')).toHaveValue('I. Nervioso, siempre');

    // Al recargar se abre la última obra usada.
    await page.getByTestId('open-works').click();
    await page.getByTestId('recent-works').locator('li', { hasText: 'Cuaderno de la Mancha' }).getByTestId('open-recent').click();
    await page.reload();
    await expect(page.getByTestId('work-title')).toHaveValue('Cuaderno de la Mancha');
    await expect(page.getByTestId('prose')).toHaveValue('Amanecía sobre la llanura.');

    // Eliminar del dispositivo pide confirmación.
    await page.getByTestId('open-works').click();
    const example = page.getByTestId('recent-works').locator('li', { hasText: 'El Corazón Delator' });
    await example.getByTestId('delete-recent').click();
    await example.getByTestId('confirm-delete').click();
    await expect(page.getByTestId('recent-works')).not.toContainText('El Corazón Delator');
  });
});
