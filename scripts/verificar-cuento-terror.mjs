/** Aceptación contra Studio y lector REALES de Windows. No sustituye una VM limpia. */
import assert from 'node:assert/strict';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { tsImport } from 'tsx/esm/api';

assert.equal(process.platform, 'win32');
const option = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const app = resolve(option('--app') ?? 'src-tauri/target/release/duvarret.exe');
const root = resolve(option('--work') ?? 'terminados/la-casa-que-aprendio-mi-nombre/obra.duvarret');
const output = resolve(option('--out') ?? 'terminados/la-casa-que-aprendio-mi-nombre/verificacion');
mkdirSync(output, { recursive: true });
assert.ok(existsSync(app), `No existe el ejecutable ${app}`);
const { planNarration } = await tsImport('../src/core/narration/plan.ts', import.meta.url);
const { ManifestEditor } = await tsImport('../src/core/agent/manifestEditor.ts', import.meta.url);
const { AssetRegistry } = await tsImport('../src/core/assets/registry.ts', import.meta.url);
const { validateManifest, checkIntegrity } = await tsImport('../src/core/manifest/index.ts', import.meta.url);
const manifestPath = join(root, 'manifest/story_manifest.json');
// Las salidas de fracaso son explícitas: no se vuelve a un puzle ya resuelto en esta partida.
const editor = new ManifestEditor(validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8'))).manifest);
for (const id of ['cuarto', 'puerta', 'sello']) editor.patchNode(id, { gameplay_overlay: { on_failure: { transition_to_node: 'nombrar' } } });
editor.patchNode('ines', { visual_novel_overlay: { trigger: 'on_node_enter' } });
writeFileSync(manifestPath, JSON.stringify(editor.current, null, 2));

const manifest = () => validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8'))).manifest;
const walk = dir => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]) : [];
const report = { date: new Date().toISOString(), executable: app, work: root, passed: [], errors: [], limitations: ['Equipo de desarrollo, no VM limpia.', 'La prueba mide generación y reproducción real; la valoración artística de las voces requiere escucha humana.', 'La red del WebView se mantiene offline; no se modifica el firewall del sistema.'] };
const saveReport = () => writeFileSync(join(output, 'VERIFICACION.json'), JSON.stringify(report, null, 2));
const passed = message => { report.passed.push(message); console.log(`PASS ${message}`); saveReport(); };
const reservation = createServer();
await new Promise(done => reservation.listen(0, '127.0.0.1', done));
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
let browser;
const children = [];
const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PATH|PYTHON|DUVARRET|VIRTUAL_ENV|CONDA_PREFIX)/i.test(key)));
const baseEnv = { ...clean, PATH: join(process.env.SystemRoot ?? 'C:/Windows', 'System32'), PYTHONHOME: join(output, 'python-externo-inexistente'), PYTHONPATH: join(output, 'runtime-externo-inexistente'), DUVARRET_PYTHON: join(output, 'no-existe.exe'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --disable-background-timer-throttling --disable-renderer-backgrounding` };
async function launch(executable, profile) {
  const child = spawn(executable, [], { cwd: dirname(executable), env: { ...baseEnv, WEBVIEW2_USER_DATA_FOLDER: join(output, profile) }, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] });
  const nativeLog = createWriteStream(join(output, `proceso-${profile}-${Date.now()}.log`));
  child.stdout.pipe(nativeLog, { end: false });
  child.stderr.pipe(nativeLog, { end: false });
  child.on('exit', (code, signal) => { report.processExits ??= []; report.processExits.push({ profile, code, signal }); nativeLog.end(); saveReport(); });
  children.push(child);
  let ready = false;
  for (let i = 0; i < 240; i++) {
    assert.equal(child.exitCode, null, 'El ejecutable terminó durante el arranque.');
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) { ready = true; break; } } catch { /* arranque */ }
    await delay(250);
  }
  assert.ok(ready, 'WebView2 no abrió el puerto de diagnóstico.');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  await context.setOffline(true);
  const page = context.pages().find(p => !p.url().startsWith('devtools:'));
  assert.ok(page);
  page.on('pageerror', error => report.errors.push(error.message));
  page.setDefaultTimeout(30000);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.bringToFront();
  return { child, page };
}
async function close(child) {
  await browser?.close().catch(() => {});
  spawnSync(join(process.env.SystemRoot ?? 'C:/Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  await delay(1500);
}
async function waitVoice(page, timeout = 1200000) {
  const end = Date.now() + timeout;
  let previous = '';
  while (Date.now() < end) {
    const error = await page.getByTestId('narration-error').textContent().catch(() => '');
    if (error) throw new Error(error);
    const message = await page.getByTestId('narration-message').textContent().catch(() => '');
    if (message && message !== previous) { console.log(message); previous = message; }
    if (message?.includes('Voz actualizada y guardada')) return message;
    await delay(2000);
  }
  throw new Error('La voz no terminó dentro del tiempo de aceptación.');
}
async function generateLine(page, voice, text, name) {
  await page.evaluate(async ({ root, voice, text, name }) => {
    const internals = window.__TAURI_INTERNALS__;
    const channel = `__CHANNEL__:${internals.transformCallback(() => {}, false)}`;
    const asset = `assets/audio/voz-natural/${voice}/${name}.wav`;
    await internals.invoke('narration_generate', { root, voice, delivery: 'natural', speed: .94, clips: [{ text, asset }], onProgress: channel });
    const data = await internals.invoke('project_read_bytes', { root, relative: asset });
    await internals.invoke('project_write_bytes', { root, relative: `assets/audio/${name}.wav`, contents: data });
  }, { root, voice, text, name });
  const wav = readFileSync(join(root, `assets/audio/${name}.wav`));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.ok(wav.length > 10000);
  const registryPath = join(root, 'assets/registry.json');
  const registry = AssetRegistry.fromJson(readFileSync(registryPath, 'utf8'));
  registry.register({ path: `assets/audio/${name}.wav`, origin: 'synthetic', status: 'ready', provider: `Kokoro-82M · ONNX local · ${voice}`, prompt: text, license: 'Modelo Apache-2.0', bytes: wav.length });
  writeFileSync(registryPath, JSON.stringify(registry.toJSON(), null, 2));
  passed(`Réplica ${name} generada por el Kokoro incluido (${voice}), ${wav.length} bytes.`);
}
try {
  let { child, page } = await launch(app, 'perfil-studio');
  await page.waitForURL(url => url.hostname === 'tauri.localhost' || url.protocol === 'tauri:');
  const studioUrl = `${page.url().split('?')[0]}?project=${encodeURIComponent(root)}`;
  await page.goto(studioUrl, { waitUntil: 'domcontentloaded' }).catch(error => {
    if (!error.message.includes('ERR_ABORTED')) throw error;
  });
  await page.getByTestId('prose').waitFor();
  await page.screenshot({ path: join(output, '01-studio.png'), fullPage: true });
  const status = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('narration_status'));
  assert.equal(status.ready, true, status.message);
  passed('Studio actual abre la obra y reconoce su motor de voz incluido.');
  report.footstepsProbe = await page.evaluate(async root => {
    const api = window.__TAURI_INTERNALS__;
    const data = await api.invoke('project_read_bytes', { root, relative: 'assets/audio/footsteps.wav' });
    const url = api.convertFileSrc(root + '/assets/audio/footsteps.wav', 'asset');
    const response = await fetch(url, { cache: 'no-store' });
    return { nativeBytes: data.length, status: response.status, fetchedBytes: (await response.arrayBuffer()).byteLength };
  }, root);
  console.log('Comprobación de pasos:', report.footstepsProbe);
  saveReport();
  const transport = await page.evaluate(async root => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const relative = 'export/verificacion-bloques.bin';
    await invoke('project_write_bytes_chunk', { root, relative, encoded: 'YWI=', offset: 0, total: 4 });
    await invoke('project_write_bytes_chunk', { root, relative, encoded: 'Y2Q=', offset: 2, total: 4 });
    return invoke('project_read_bytes', { root, relative });
  }, root);
  assert.deepEqual(transport, [97, 98, 99, 100]);
  passed('El ejecutable actual recibe y publica archivos por bloques sin pérdida de bytes.');
  if (process.argv.includes('--studio-formats')) {
    await page.getByTestId('agent-capabilities').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="chat-director"]')].some(el => /ganzúa/.test(el.textContent ?? '') && /linterna/.test(el.textContent ?? '')));
    const initialManifest = readFileSync(manifestPath, 'utf8');
    for (const [message, label] of [
      ['Quiero un minijuego de ganzúa para forzar una cerradura', 'Ganzúa'],
      ['Buscar con linterna un objeto en el cuarto con assets/images/cuarto.svg', 'linterna'],
    ]) {
      await page.getByTestId('agent-input').fill(message);
      await page.getByTestId('agent-send').click();
      const pitch = page.locator('[data-testid^="pitch-chat:"]').last();
      await pitch.waitFor();
      assert.match(await pitch.innerText(), new RegExp(label, 'i'));
      await pitch.getByTestId('pitch-dismiss').click();
    }
    assert.equal(readFileSync(manifestPath, 'utf8'), initialManifest);
    passed('El director del Studio real descubre capacidades y propone ganzúa y búsqueda con linterna como borradores sin modificar la obra.');
    await page.getByTestId('open-export').click();
    await page.getByTestId('export-select-audio_drama').check();
    await page.getByTestId('export-select-native').check();
    await page.getByTestId('export-selected').click();
    await page.getByTestId('export-next-steps').waitFor({ timeout: 240000 });
    assert.equal(await page.getByTestId('export-pending').count(), 0);
    const { unzipSync } = await import('fflate');
    const archives = walk(join(root, 'export'));
    for (const suffix of ['-web.zip', '-audio-drama.zip', '-escritorio.zip']) assert.ok(archives.some(file => file.endsWith(suffix)), `Falta ${suffix}`);
    const archive = archives.find(file => file.endsWith('-escritorio.zip'));
    const packed = unzipSync(readFileSync(archive));
    assert.ok(Object.keys(packed).some(file => file.endsWith('.exe')));
    assert.ok(Object.keys(packed).some(file => file.endsWith('/obra/manifest/story_manifest.json')));
    await page.screenshot({ path: join(output, '03-formatos-independientes.png'), fullPage: true });
    passed('Seleccionar tres formatos en Studio crea tres ZIP independientes; el de escritorio contiene programa y obra.');
    await page.getByTestId('modal-close').click();
  }
  if (!process.argv.includes('--export-only')) {
  await generateLine(page, 'ef_dora', 'No digas tu nombre. Aquí las paredes aprenden por repetición. Tu madre cerró una boca. Alguien ha vuelto a enseñarle a leer.', 'voz-ines');
  await generateLine(page, 'em_alex', 'Ya sé dónde empiezas.', 'voz-casa');
  await page.reload();
  await page.getByTestId('prose').waitFor();
  await page.getByTestId('open-narration').click();
  if (await page.getByTestId('narration-provider').count()) await page.getByTestId('narration-provider').selectOption('kokoro');
  await page.getByTestId('narration-update').click();
  await waitVoice(page);
  const first = manifest();
  assert.equal(first.global_settings.narration_voice.provider, 'kokoro');
  const clips = first.global_settings.narration_voice.clips;
  assert.ok(clips.length > 20);
  for (const clip of clips) {
    assert.ok(!clip.text.includes('⟦'), `Se intentó narrar una marca: ${clip.text}`);
    const bytes = readFileSync(join(root, clip.asset));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.ok(bytes.length > 1000);
  }
  passed(`Narración de ${clips.length} intervenciones generada y guardada desde la interfaz nativa.`);
  await page.screenshot({ path: join(output, '02-voz-generada.png'), fullPage: true });
  await page.getByTestId('modal-close').click();
  const originalText = await page.getByTestId('prose').inputValue();
  const footers = ['En la última gota reconocí el ritmo de mi pulso.', 'El mar respondió con un latido que no era mío.', 'El silencio del faro me acompañó hasta la verja.', 'La lluvia empezó a caer al ritmo de una respiración.'];
  let baseText = originalText;
  for (const footer of footers) if (baseText.endsWith('\n\n' + footer)) baseText = baseText.slice(0, -(footer.length + 2));
  let revisedText = baseText;
  let expectedNew = 0;
  for (const footer of footers) {
    revisedText = baseText + '\n\n' + footer;
    const draft = new ManifestEditor(manifest());
    draft.patchNode(draft.current.nodes[0].node_id, { text_payload: revisedText });
    const planned = await planNarration(draft.current, path => existsSync(join(root, path)));
    expectedNew = planned.pending.length;
    if (expectedNew === 1) break;
  }
  assert.ok(expectedNew <= 1);
  await page.getByTestId('prose').fill(revisedText);
  await page.getByTestId('save').click();
  await page.getByTestId('open-narration').click();
  await page.getByTestId('narration-update').click();
  const incremental = await waitVoice(page, 180000);
  assert.ok(incremental.includes(`${expectedNew} ${expectedNew === 1 ? 'frase nueva' : 'frases nuevas'}`), incremental);
  await page.getByTestId('narration-update').click();
  const reused = await waitVoice(page, 120000);
  assert.match(reused, /0 frases nuevas/);
  passed(`Editar y actualizar genera ${expectedNew} intervenciones nuevas según la caché; repetir reutiliza todas las grabaciones.`);
  await page.getByTestId('modal-close').click();
  await page.getByTestId('save').click();
  await close(child);
  ({ child, page } = await launch(app, 'perfil-studio'));
  await page.goto(studioUrl, { waitUntil: 'domcontentloaded' }).catch(error => {
    if (!error.message.includes('ERR_ABORTED')) throw error;
  });
  await page.getByTestId('prose').waitFor();
  assert.equal(await page.getByTestId('prose').inputValue(), revisedText);
  assert.ok(manifest().nodes.some(n => n.acoustic_events.some(e => e.trigger === 'on_text_marker' && e.delay_ms > 0)));
  assert.ok(!checkIntegrity(manifest()).some(i => i.severity === 'error'));
  passed('Tras cerrar y reabrir Studio se conservan texto, marcas, retardos y voz guardada.');
  }
  if (option('--wait-reader')) {
    const readyPath = resolve(option('--wait-reader'));
    const end = Date.now() + 1200000;
    while (!existsSync(readyPath) && Date.now() < end) await delay(2000);
    assert.ok(existsSync(readyPath), 'El lector actualizado no terminó de compilar.');
  }
  await page.getByTestId('open-export').click();
  await page.getByTestId('export-web').click();
  await Promise.race([
    page.getByTestId('export-next-steps').waitFor({ timeout: 180000 }),
    page.getByTestId('export-pending').waitFor({ timeout: 180000 }).then(async () => { throw new Error(await page.getByTestId('export-pending').innerText()); }),
  ]);
  assert.equal(await page.getByTestId('export-pending').count(), 0);
  await page.getByTestId('export-native').click();
  await page.getByTestId('export-next-steps').waitFor({ timeout: 180000 });
  assert.equal(await page.getByTestId('export-pending').count(), 0);
  await page.screenshot({ path: join(output, '03-exportacion.png'), fullPage: true });
  const exported = walk(join(root, 'export'));
  assert.ok(exported.some(f => f.endsWith('.zip')), 'Falta exportación web.');
  const portable = exported.find(f => f.endsWith('.exe'));
  assert.ok(portable, 'Falta lector portátil.');
  report.portable = portable;
  const exportedManifest = exported.find(f => f.endsWith('story_manifest.json'));
  assert.ok(exportedManifest);
  const packed = validateManifest(JSON.parse(readFileSync(exportedManifest, 'utf8'))).manifest;
  assert.ok(packed.nodes.some(n => n.acoustic_events.some(e => e.trigger_marker && e.delay_ms > 0)));
  passed('Studio exporta Web y lector portátil sin archivos pendientes; la exportación conserva marcas y retardo.');
  await close(child);
  ({ child, page } = await launch(portable, 'perfil-lector'));
  // CDP puede descubrir la ventana aún en about:blank. No recargar ese documento inicial.
  await page.getByTestId('begin').waitFor({ timeout: 60000 });
  await page.addInitScript(() => {
    window.__realAudioStarts = [];
    window.__systemSpeech = [];
    const speak = speechSynthesis.speak;
    speechSynthesis.speak = function (utterance) { window.__systemSpeech.push(utterance.text); return speak.call(this, utterance); };
    const bytesByBuffer = new WeakMap();
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (data, ...args) {
      const bytes = data.byteLength;
      const result = decode.call(this, data, ...args);
      result.then(buffer => bytesByBuffer.set(buffer, bytes));
      return result;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.__realAudioStarts.push({ bytes: bytesByBuffer.get(this.buffer), at: performance.now(), loop: this.loop });
      return start.apply(this, args);
    };
  });
  await page.reload();
  await page.getByTestId('begin').waitFor();
  await page.getByTestId('toggle-sound').click();
  await page.getByTestId('begin').click();
  await page.getByTestId('node-view').waitFor();
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: join(output, '04-lector-real.png'), fullPage: true });
  passed('El lector portátil real arranca offline con imágenes y sonido activado.');
  // El recorrido interactivo se delega a la función de aceptación compartida, sin saltar estados.
  const { playHorrorRoute } = await import('./lib/recorrido-terror.mjs');
  await page.getByTestId('toggle-screenless').click();
  const bodyBytes = readFileSync(join(root, manifest().nodes[0].screenless_mode.voice_over_asset)).length;
  await page.waitForFunction(bytes => window.__realAudioStarts.some(start => start.bytes === bytes), bodyBytes, { timeout: 60000 });
  assert.deepEqual(await page.evaluate(() => window.__systemSpeech), []);
  await page.screenshot({ path: join(output, '04b-narracion-local.png'), fullPage: true });
  await page.getByTestId('screenless-stage').press('Escape');
  await page.getByTestId('screenless-stage').waitFor({ state: 'detached' });
  passed('La lectura sin pantalla reproduce el párrafo grabado por Kokoro, sin recurrir a la voz del sistema.');
  await playHorrorRoute(page, manifest(), output, passed, root, 'sellar');
  await page.reload();
  await page.getByTestId('begin').click();
  await page.getByTestId('toggle-sound').click();
  await playHorrorRoute(page, manifest(), output, passed, root, 'nombrar');
  await close(child);
  report.status = 'passed';
  assert.deepEqual(report.errors, [], 'Errores no controlados durante la aceptación.');
  saveReport();
  console.log(`Informe: ${join(output, 'VERIFICACION.json')}`);
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack ?? String(error);
  report.screen = await browser?.contexts()[0]?.pages()[0]?.evaluate(() => ({
    exportMessage: document.querySelector('[data-testid="export-message"]')?.textContent,
    missing: document.querySelector('[data-testid="export-missing-assets"]')?.textContent,
    pending: document.querySelector('[data-testid="export-pending"]')?.textContent,
  })).catch(() => undefined);
  await browser?.contexts()[0]?.pages()[0]?.screenshot({ path: join(output, 'error-nativo.png'), fullPage: true }).catch(() => {});
  saveReport();
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  for (const child of children) if (child.exitCode === null) spawnSync(join(process.env.SystemRoot ?? 'C:/Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
}
