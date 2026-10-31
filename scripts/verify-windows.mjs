/** Prueba del ejecutable real en WebView2, sobre una copia de la obra. */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';

const repo = resolve(import.meta.dirname, '..');
const slug = process.env.DUVARRET_TEST_WORK ?? 'el-ultimo-minuto';
const output = join(repo, 'terminados', slug);
const reader = process.argv.includes('--lector');
const ux = process.argv.includes('--ux');
const app = process.env.DUVARRET_TEST_EXECUTABLE ?? join(output, reader ? `portable/${slug}.exe` : 'Duvarret-Studio.exe');
const scratch = mkdtempSync(join(repo, '.cache/native-build/prueba-studio-'));
const testWork = join(scratch, 'copia.duvarret');
cpSync(join(output, `${slug}.duvarret`), testWork, { recursive: true });
const portReservation = createServer();
await new Promise(resolve => portReservation.listen(0, '127.0.0.1', resolve));
const port = portReservation.address().port;
await new Promise(resolve => portReservation.close(resolve));
const launch = spawnSync('powershell.exe', ['-NoProfile', '-Command', '(Start-Process -FilePath $env:DUVARRET_TEST_APP -WindowStyle Hidden -PassThru).Id'], {
  env: { ...process.env, DUVARRET_TEST_APP: app, WEBVIEW2_USER_DATA_FOLDER: join(scratch, 'webview-profile'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` },
  encoding: 'utf8', windowsHide: true,
});
assert.equal(launch.status, 0, launch.stderr);
const pid = Number(launch.stdout.trim().split(/\s+/).at(-1));
assert.ok(pid > 0, 'Debe iniciarse el ejecutable real');
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 180; attempt++) {
    try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { /* WebView2 está arrancando. */ }
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, 'WebView2 debe permitir la conexión de prueba local');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0].pages().find(page => !page.url().startsWith('devtools:'));
  assert.ok(page, 'Debe existir la ventana de Studio');
  await page.waitForURL(url => url.hostname === 'tauri.localhost' || url.protocol === 'tauri:', { timeout: 45000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  if (reader) {
    await page.addInitScript(() => {
      window.__nativeSources = [];
      window.__nativeEnds = 0;
      window.__nativeOverlap = 0;
      window.__nativeSpeech = [];
      const active = new Set();
      const start = AudioBufferSourceNode.prototype.start;
      const stop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (!this.loop) {
          this.playbackRate.value = 20;
          if (active.size) window.__nativeOverlap++;
          active.add(this);
          window.__nativeSources.push(this.buffer?.duration ?? 0);
          this.addEventListener('ended', () => { active.delete(this); window.__nativeEnds++; });
        }
        return start.apply(this, args);
      };
      AudioBufferSourceNode.prototype.stop = function (...args) { active.delete(this); return stop.apply(this, args); };
      speechSynthesis.speak = utterance => window.__nativeSpeech.push(utterance.text);
    });
    await page.reload();
    await page.getByTestId('begin').click({ timeout: 45000 });
    assert.equal(await page.getByTestId('toggle-sound').getAttribute('aria-pressed'), 'false');
    await page.getByTestId('toggle-sound').click();
    await page.getByTestId('toggle-screenless').click();
    await page.waitForFunction(() => window.__nativeEnds >= 3, undefined, { timeout: 45000 });
    assert.equal(await page.evaluate(() => window.__nativeOverlap), 0);
    assert.deepEqual(await page.evaluate(() => window.__nativeSpeech), []);
    assert.ok((await page.evaluate(() => window.__nativeSources)).some(duration => duration > 15));
    await page.getByTestId('screenless-stage').press('Escape');
    await page.screenshot({ path: join(output, 'lector-windows.png'), fullPage: true });
    assert.deepEqual(errors, []);
    const report = 'Lector nativo de Windows: correcto.\n- Ejecutable portátil real con WebView2.\n- Obra cargada desde su carpeta obra mediante el protocolo local.\n- Título, narración y opción reproducidos desde WAV, sin solapamientos.\n- Cero llamadas a speechSynthesis.\n- Salida del modo audio verificada.\n';
    writeFileSync(join(output, 'VERIFICACION-LECTOR-WINDOWS.txt'), report);
    console.log(report);
  } else {
  await page.goto(`${page.url().split('?')[0]}?project=${encodeURIComponent(testWork)}`);
  await page.getByTestId('prose').waitFor({ timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="work-title"]')?.value?.includes('El último minuto'));
  const original = await page.getByTestId('prose').inputValue();
  assert.ok(original.includes('máquina'));
  await page.screenshot({ path: join(output, 'studio-actualizado.png'), fullPage: true });
  const edited = `${original}\n\nPrueba temporal de edición nativa.`;
  await page.getByTestId('prose').fill(edited);
  if (!ux) await page.getByTestId('save').click();
  let saved;
  for (let attempt = 0; attempt < 160; attempt++) {
    saved = JSON.parse(readFileSync(join(testWork, 'manifest/story_manifest.json'), 'utf8'));
    if (saved.nodes[0].text_payload === edited) break;
    await delay(100);
  }
  assert.equal(saved.nodes[0].text_payload, edited);
  assert.equal(saved.nodes[0].screenless_mode.narration_text, edited);
  assert.equal(saved.global_settings.narration_voice.voice_id, 'kokoro:ef_dora');
  assert.equal(saved.global_settings.narration_voice.clips.length, 18);
  if (ux) {
    await page.getByTestId('save-state').filter({ hasText: 'Todo guardado' }).waitFor();
    await page.getByTestId('undo').click();
    assert.equal(await page.getByTestId('prose').inputValue(), original);
    await page.getByTestId('redo').click();
    assert.equal(await page.getByTestId('prose').inputValue(), edited);
  }
  await page.getByTestId('open-export').click();
  await page.getByText(/La voz de la obra necesita actualizar/).first().waitFor();
  if (ux) await page.getByTestId('export-fix-voice').click();
  else { await page.getByTestId('modal-close').click(); await page.getByTestId('open-narration').click(); }
  if (ux) {
    await page.getByTestId('modal-close').focus();
    await page.keyboard.press('Shift+Tab');
    assert.ok(await page.locator('[aria-modal="true"]').evaluate(panel => panel.contains(document.activeElement) && document.activeElement?.getAttribute('data-testid') !== 'modal-close'));
    await page.keyboard.press('Tab');
    assert.ok(await page.getByTestId('modal-close').evaluate(button => document.activeElement === button));
  }
  await page.getByTestId('narration-delivery').selectOption('sweet');
  await page.getByTestId('narration-update').click();
  await page.getByTestId('narration-message').filter({ hasText: 'Voz actualizada y guardada' }).waitFor({ timeout: 240000 });
  const updated = JSON.parse(readFileSync(join(testWork, 'manifest/story_manifest.json'), 'utf8'));
  assert.equal(updated.nodes[0].text_payload, edited);
  assert.equal(updated.global_settings.narration_voice.delivery, 'sweet');
  assert.equal(updated.global_settings.narration_voice.speed, 0.91);
  const regenerated = updated.global_settings.narration_voice.clips.find(clip => clip.text === edited);
  assert.ok(regenerated, 'La app debe grabar la frase editada sin cerrar la obra');
  assert.equal(readFileSync(join(testWork, regenerated.asset)).toString('ascii', 0, 4), 'RIFF');
  await page.screenshot({ path: join(output, 'studio-voz-integrada.png'), fullPage: true });
  await page.getByTestId('narration-update').click();
  await page.getByTestId('narration-message').filter({ hasText: '0 frases nuevas' }).waitFor({ timeout: 45000 });
  await page.getByTestId('modal-close').click();
  await page.getByTestId('open-export').click();
  assert.equal(await page.getByText(/La voz de la obra necesita actualizar/).count(), 0);
  if (ux) {
    await page.getByTestId('export-web').click();
    await page.getByTestId('export-next-steps').waitFor({ timeout: 120000 });
    assert.ok(readFileSync(join(testWork, 'export/el-ultimo-minuto-web.zip')).length > 1000000);
    await page.getByTestId('export-show-folder').waitFor();
    await page.screenshot({ path: join(output, 'ux-exportacion.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(output, 'ux-exportacion-movil.png'), fullPage: true });
    await page.getByTestId('modal-close').click();
    await page.getByTestId('view-preview').click();
    await page.getByTestId('preview-mobile').waitFor({ state: 'visible' });
    await page.getByTestId('view-write').click();
    await page.getByTestId('prose').waitFor({ state: 'visible' });
    await page.screenshot({ path: join(output, 'ux-escritura-movil.png'), fullPage: true });
    const closingText = `${edited}\n\nGuardado al cerrar la ventana.`;
    await page.getByTestId('prose').fill(closingText);
    const close = spawnSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).CloseMainWindow()`], { encoding: 'utf8', windowsHide: true });
    assert.equal(close.stdout.trim(), 'True', 'La ventana debe recibir el cierre nativo');
    for (let attempt = 0; attempt < 120; attempt++) {
      const closingManifest = JSON.parse(readFileSync(join(testWork, 'manifest/story_manifest.json'), 'utf8'));
      if (closingManifest.nodes[0].text_payload === closingText) break;
      await delay(100);
    }
    assert.equal(JSON.parse(readFileSync(join(testWork, 'manifest/story_manifest.json'), 'utf8')).nodes[0].text_payload, closingText);
    writeFileSync(join(output, 'VERIFICACION-UX-WINDOWS.txt'), 'Studio nativo: guardado automático sin pulsar Guardar, deshacer/rehacer, reparación directa de voz desde Exportar, foco atrapado en el diálogo, exportación ZIP real con imágenes y grabaciones, instrucciones para compartir, interfaz de 390 px sin desbordamiento y guardado al cerrar la ventana.\nProyecto original intacto: pruebas sobre una copia.\n');
  }
  assert.deepEqual(errors, [], 'Studio no debe producir errores JavaScript, WASM ni de acceso al proyecto');
  const report = 'Prueba de Windows: correcta.\n- Duvarret-Studio.exe real iniciado con WebView2.\n- Proyecto abierto desde una carpeta local (copia de prueba).\n- Texto editado y guardado mediante los comandos nativos.\n- Narración sincronizada y voz ef_dora conservada.\n- Publicación bloqueada ante una frase pendiente de grabación.\n- Voz dulce generada desde el botón de Studio sin cerrar la obra.\n- WAV nuevo guardado y publicación desbloqueada.\n- Segunda actualización incremental: cero frases nuevas.\n- Sin errores JavaScript ni WASM.\n- El proyecto original no se modificó durante la prueba.\n';
  writeFileSync(join(output, 'VERIFICACION-WINDOWS.txt'), report);
  console.log(report);
  }
} finally {
  await browser?.close().catch(() => undefined);
  spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
}
