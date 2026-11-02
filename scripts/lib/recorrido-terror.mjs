import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

/** Recorre controles reales del lector; nunca llama a goTo ni modifica su estado. */
export async function playHorrorRoute(page, manifest, output, passed, root, ending = 'sellar') {
  const node = id => page.locator(`[data-testid="node-view"][data-node="${id}"]`);
  const visit = id => node(id).waitFor();
  const complete = async () => {
    const skip = page.getByTestId('skip-reading');
    if (await skip.count()) await skip.evaluate(button => button.click());
  };
  const next = async id => { await complete(); await page.getByTestId('continue').click(); await visit(id); };
  await visit('costa');
  await next('ines');
  await complete();
  await page.getByTestId('visual-novel').waitFor();
  await page.getByTestId('vn-avatar').evaluate(async img => { if (!img.complete) await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; }); });
  assert.ok(await page.getByTestId('vn-avatar').evaluate(img => img.naturalWidth > 0));
  await page.screenshot({ path: join(output, '05-novela-visual.png'), fullPage: true });
  passed('Novela visual: retrato y diálogo de Inés aparecen en el lector real.');
  await next('pasillo');
  assert.ok(await page.locator('.dv-layout-narrow-corridor').count());
  const marker = page.locator('[data-marker="golpe"]');
  await marker.waitFor({ state: 'attached' });
  await page.waitForTimeout(100);
  const markerBelowLine = await marker.evaluate(el => {
    const player = el.closest('[data-testid="runtime-player"]');
    const rect = player.getBoundingClientRect();
    const top = Math.max(0, rect.top);
    const line = top + (Math.min(innerHeight, rect.bottom) - top) * .65;
    return el.getBoundingClientRect().top > line;
  });
  assert.ok(markerBelowLine, 'La marca debe estar fuera de la zona de lectura antes de medir el retardo.');
  const scrolledAt = await page.evaluate(() => performance.now());
  await marker.evaluate(el => el.scrollIntoView({ block: 'center' }));
  const knockBytes = readFileSync(join(root, 'assets/audio/knock.wav')).length;
  await page.waitForFunction(bytes => window.__realAudioStarts?.some(start => start.bytes === bytes), knockBytes, { timeout: 15000 });
  const start = await page.evaluate(bytes => window.__realAudioStarts.find(start => start.bytes === bytes), knockBytes);
  assert.ok(start.at - scrolledAt >= 950, `El retardo de 1200 ms se adelantó: ${start.at - scrolledAt} ms`);
  await page.locator('[data-testid="runtime-player"]').evaluate(el => { el.scrollTop = 0; });
  await marker.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1400);
  assert.equal(await page.evaluate(bytes => window.__realAudioStarts.filter(start => start.bytes === bytes).length, knockBytes), 1);
  await page.screenshot({ path: join(output, '06-pasillo-marca.png'), fullPage: true });
  passed(`Marca por scroll con retardo real de ${Math.round(start.at - scrolledAt)} ms y sin repetirse al volver atrás.`);
  await next('cuarto');
  await complete();
  const room = page.getByTestId('room-search');
  await room.waitFor();
  await page.waitForFunction(() => { const img = document.querySelector('[data-testid="room-search"] img'); return img?.complete && img.naturalWidth > 0; });
  if (ending === 'abandonar') {
    await page.getByTestId('sandbox-giveup').click();
    await visit('nombrar');
    passed('Abandonar la búsqueda lleva a un desenlace explícito y no deja al lector bloqueado.');
    return;
  }
  await room.scrollIntoViewIfNeeded();
  const collect = page.getByTestId('room-collect');
  assert.equal(await collect.isDisabled(), true);
  const rect = await room.boundingBox();
  assert.ok(rect);
  await page.mouse.move(rect.x + rect.width * .72, rect.y + rect.height * .64);
  assert.equal(await collect.isEnabled(), true);
  await page.screenshot({ path: join(output, '07-linterna-objeto.png') });
  // La captura de página completa puede desplazar el cuarto bajo el puntero y apagar el objeto.
  await collect.hover({ force: true });
  await collect.click();
  await visit('antes_puerta');
  await page.getByTestId('toggle-inventory').click();
  await page.getByTestId('item-ganzua').waitFor();
  await page.getByTestId('item-ganzua').click();
  assert.match(await page.getByTestId('item-detail').innerText(), /1, 3, 2/);
  await page.screenshot({ path: join(output, '08-inventario.png'), fullPage: true });
  await page.getByTestId('toggle-inventory').click();
  passed('La linterna descubre la ganzúa, el clic la incorpora al inventario y desbloquea la elección de la puerta.');
  await page.getByTestId('choice-0').click();
  await visit('puerta');
  await complete();
  await page.getByTestId('lockpick').waitFor();
  if (ending === 'fallar') {
    for (let i = 0; i < 5; i++) await page.getByTestId('pin-fix-0').click();
    await visit('nombrar');
    await page.screenshot({ path: join(output, '14-fracaso-ganzua.png'), fullPage: true });
    passed('Agotar los cinco intentos de la ganzúa conduce al desenlace previsto, sin falso reintento.');
    return;
  }
  for (const [i, height] of [1, 3, 2].entries()) {
    const slider = page.getByTestId(`pin-height-${i}`);
    await slider.focus();
    await slider.press('Home');
    for (let count = 0; count < height; count++) await slider.press('ArrowRight');
    if (i === 2) await page.screenshot({ path: join(output, '09-ganzua.png'), fullPage: true });
    await page.getByTestId(`pin-fix-${i}`).click();
  }
  await visit('archivo');
  passed('La cerradura de ganzúa se resuelve con teclado y abre el archivo.');
  await complete();
  await page.getByTestId('file-expediente.txt').click();
  await page.getByTestId('desktop-window').waitFor();
  assert.match(await page.getByTestId('desktop-window').innerText(), /314/);
  await page.screenshot({ path: join(output, '10-expediente.png'), fullPage: true });
  await next('tinta');
  assert.ok(await page.locator('.dv-layout-melt-text').count());
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(output, '11-texto-derretido.png'), fullPage: true });
  await next('caida');
  assert.ok(await page.locator('.dv-layout-physics-fall').count());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(output, '12-letras-locura.png'), fullPage: true });
  passed('El expediente se puede leer; el derretimiento y la caída física de las letras funcionan en WebView2.');
  await next('sello');
  await complete();
  const lock = page.getByTestId('cipher-lock');
  await lock.waitFor();
  await lock.focus();
  await lock.press('3'); await lock.press('1'); await lock.press('4'); await lock.press('Enter');
  await page.getByTestId('choice-0').waitFor();
  await page.getByTestId(ending === 'sellar' ? 'choice-0' : 'choice-1').click();
  await visit(ending);
  await page.screenshot({ path: join(output, `13-final-${ending}.png`), fullPage: true });
  assert.equal(manifest.nodes.find(n => n.node_id === ending).navigation.is_ending, true);
  passed(`El sello 314 desbloquea los dos desenlaces y se alcanza el final de ${ending}.`);
  if (ending === 'nombrar') {
    for (const failure of ['fallar', 'abandonar']) {
      await page.reload();
      await page.getByTestId('begin').click();
      await page.getByTestId('toggle-sound').click();
      await playHorrorRoute(page, manifest, output, passed, root, failure);
    }
  }
}
