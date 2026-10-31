/** Prueba real sobre instalación aislada. No sustituye una VM limpia ni bloquea la red del SO.
 * --app C:\ruta\duvarret.exe: verifica un directorio ya preparado.
 * --installer C:\ruta\setup.exe: instala tras descartar instalación previa.
 * No desinstala ni borra directorios. Solo termina los procesos iniciados por esta prueba.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

assert.equal(process.platform, 'win32', 'Esta prueba requiere Windows.');
const repo = resolve(import.meta.dirname, '..');
const option = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const installer = option('--installer');
let app = option('--app');
assert.ok(Boolean(installer) !== Boolean(app), 'Indica --installer o --app, exclusivamente.');
const output = join(repo, 'terminados/instalador-hibrido');
mkdirSync(output, { recursive: true });
const scratch = mkdtempSync(join(output, 'prueba con tilde á-'));
const installDir = join(scratch, 'Instalación aislada');
const testWork = join(scratch, 'La semilla.duvarret');
const system32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
const powershell = join(system32, 'WindowsPowerShell/v1.0/powershell.exe');
const ps = (code, env = {}) => spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ' + code], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } });
const run = (binary, args, options = {}) => new Promise((resolveRun, reject) => {
  const child = spawn(binary, args, { windowsHide: true, ...options });
  let stdout = '', stderr = '';
  child.stdout?.on('data', data => { stdout += data; }); child.stderr?.on('data', data => { stderr += data; });
  child.on('error', reject); child.on('close', code => code === 0 ? resolveRun({ stdout, stderr }) : reject(new Error(`${binary}: ${code}\n${stderr}\n${stdout}`)));
});
const manifest = () => JSON.parse(readFileSync(join(testWork, 'manifest/story_manifest.json'), 'utf8'));
const allFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? allFiles(join(dir, entry.name)) : [join(dir, entry.name)]);
const inside = (base, path) => { const rel = relative(base, path); return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel); };
const waitNarration = (page, text, timeout) => Promise.race([
  page.getByTestId('narration-message').filter({ hasText: text }).waitFor({ timeout }),
  page.getByTestId('narration-message').filter({ hasText: 'No se pudo generar' }).waitFor({ timeout }).then(async () => {
    throw new Error(await page.getByTestId('narration-message').innerText());
  }),
]);

if (installer) {
  const prior = ps("$roots = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); Get-ItemProperty $roots -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*Duvarret*' } | Select-Object DisplayName,InstallLocation | ConvertTo-Json -Compress");
  assert.equal(prior.status, 0, prior.stderr);
  assert.equal(prior.stdout.trim(), '', 'Ya existe una instalación de Duvarret. No se ejecutará el instalador sobre el usuario actual; usa un usuario o una VM dedicados, o --app sobre la extracción de prueba.');
  // NSIS exige /D último y SIN comillas, aunque tenga espacios. No interviene un shell.
  assert.ok(inside(scratch, installDir));
  await run(resolve(installer), ['/S', `/D=${installDir}`], { windowsVerbatimArguments: true });
  const candidates = readdirSync(installDir).filter(name => /\.exe$/i.test(name) && !/uninstall|python|player|vc_redist|webview/i.test(name)).map(name => join(installDir, name));
  assert.equal(candidates.length, 1, `No se identifica Studio: ${candidates.join(', ')}`);
  app = candidates[0];
}
app = resolve(app);
assert.ok(existsSync(app), `No existe ${app}`);
await run(process.execPath, [join(repo, 'node_modules/tsx/dist/cli.mjs'), join(repo, 'scripts/preparar-prueba-instalacion.ts'), testWork]);
const reservation = createServer();
await new Promise(done => reservation.listen(0, '127.0.0.1', done));
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PATH|PYTHON|DUVARRET|VIRTUAL_ENV|CONDA_PREFIX)/i.test(key)));
Object.assign(cleanEnv, {
  PATH: system32,
  DUVARRET_PYTHON: join(scratch, 'no-existe-python.exe'),
  DUVARRET_KOKORO_MODELS: join(scratch, 'modelos-inexistentes'),
  DUVARRET_KOKORO_RUNTIME: join(scratch, 'runtime-inexistente'),
  PYTHONHOME: join(scratch, 'python-home-invalido'), PYTHONPATH: join(scratch, 'python-path-invalido'),
  WEBVIEW2_USER_DATA_FOLDER: join(scratch, 'perfil-webview2'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
});
let browser;
const launched = [];
const launchApp = async executable => {
  const child = spawn(executable, [], { cwd: scratch, env: cleanEnv, windowsHide: true, stdio: 'ignore' });
  launched.push(child);
  for (let attempt = 0; attempt < 240; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { /* arranque */ }
    assert.equal(child.exitCode, null, 'El ejecutable terminó antes de abrir WebView2.');
    await delay(250);
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  await context.setOffline(true); // Solo red del WebView2; no modifica firewall ni adaptadores.
  const page = context.pages().find(page => !page.url().startsWith('devtools:'));
  assert.ok(page);
  return { child, context, page };
};
const report = { date: new Date().toISOString(), executable: app, installation: installer ? installDir : 'directorio preparado externamente', scratch, passed: [], limitations: ['Prueba en el equipo de desarrollo; no es una VM limpia.', 'PATH y variables de Python contaminadas a propósito; no se desinstaló Python del equipo.', 'Offline de WebView2: no bloquea la red de procesos nativos ni equivale a desconectar el equipo.'], sources: ['https://nsis.sourceforge.io/Docs/Chapter3.html', 'https://v2.tauri.app/distribute/windows-installer/'] };
try {
  const { child, page } = await launchApp(app);
  const errors = [], remoteRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { const url = request.url(); if (/^https?:/.test(url) && !/^https?:\/\/(tauri|asset|ipc)\.localhost/.test(url) && !/^http:\/\/127\.0\.0\.1:/.test(url)) remoteRequests.push(url); });
  await page.waitForURL(url => url.hostname === 'tauri.localhost' || url.protocol === 'tauri:', { timeout: 60000 });
  await page.goto(`${page.url().split('?')[0]}?project=${encodeURIComponent(testWork)}`);
  await page.getByTestId('prose').waitFor({ timeout: 60000 });
  const fakeKey = 'duvarret-test-only-not-a-real-key';
  for (const provider of ['gemini', 'compatible']) {
    const prior = await page.evaluate(async provider => window.__TAURI_INTERNALS__.invoke('ai_credential_status', { provider }), provider);
    if (prior.configured) { report.passed.push(`Credencial ${provider} existente: no se tocó.`); continue; }
    await page.getByRole('button', { name: /Preferencias|Ajustes/ }).first().click();
    try {
      await page.getByTestId('ai-connection-provider').selectOption(provider);
      await page.getByTestId('provider-key').fill(fakeKey);
      await page.getByTestId('ai-save-key').click();
      await page.getByTestId('ai-key-status').filter({ hasText: 'Clave configurada' }).waitFor();
      assert.equal(await page.evaluate(() => Object.values(localStorage).some(value => String(value).includes('duvarret-test-only-not-a-real-key'))), false);
      const stored = await page.evaluate(async provider => window.__TAURI_INTERNALS__.invoke('ai_credential_status', { provider }), provider);
      assert.equal(stored.configured, true);
      await page.getByTestId('ai-connections').scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(scratch, 'conexiones-ia-instaladas.png'), fullPage: true });
      await page.getByTestId('ai-forget-key').click();
      await page.getByTestId('ai-key-status').filter({ hasText: 'Sin clave configurada' }).waitFor();
      const removed = await page.evaluate(async provider => window.__TAURI_INTERNALS__.invoke('ai_credential_status', { provider }), provider);
      assert.equal(removed.configured, false);
      report.passed.push(`Conexión ${provider}: clave ficticia guardada y eliminada desde la interfaz nativa, sin enviarla ni persistirla en localStorage.`);
    } finally {
      // Solo se elimina el proveedor que estaba vacío antes de esta prueba; nunca secretos previos.
      await page.evaluate(async provider => window.__TAURI_INTERNALS__.invoke('ai_credential_remove', { provider }), provider);
      await page.getByTestId('modal-close').click();
    }
  }
  assert.equal(manifest().global_settings.narration_voice, undefined, 'La primera generación no puede usar clips precocinados.');
  await page.getByTestId('open-narration').click();
  await page.getByTestId('narration-delivery').selectOption('sweet');
  await page.getByTestId('narration-update').click();
  // Capturar el intérprete y DLL mientras está generando. Evidencia de ubicación, no de VM.
  await delay(3000);
  const witness = ps('$children=Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq [int]$env:TEST_PARENT_PID }; @(foreach($child in $children){ $modules=@(); try { $modules=@((Get-Process -Id $child.ProcessId -ErrorAction Stop).Modules | Select-Object -ExpandProperty FileName) } catch {}; [pscustomobject]@{ executable=$child.ExecutablePath; command=$child.CommandLine; modules=$modules } }) | ConvertTo-Json -Depth 3', { TEST_PARENT_PID: String(child.pid) });
  writeFileSync(join(scratch, 'procesos-generacion.txt'), witness.stdout + witness.stderr);
  assert.equal(witness.status, 0, witness.stderr);
  const parsedProcesses = JSON.parse(witness.stdout || '[]');
  const processes = Array.isArray(parsedProcesses) ? parsedProcesses : [parsedProcesses];
  const python = processes.find(item => /python[^\\/]*\.exe$/i.test(item.executable ?? ''));
  assert.ok(python, 'Debe observarse el intérprete autocontenido durante la generación.');
  assert.ok(inside(dirname(app), python.executable), 'El intérprete debe salir del directorio de instalación.');
  assert.match(python.command, /(?:^|\s)-I(?:\s|$)/, 'El intérprete debe ignorar el entorno Python externo.');
  await waitNarration(page, 'Voz actualizada y guardada', 900000);
  const first = manifest();
  assert.ok(first.global_settings.narration_voice.clips.length > 5);
  for (const clip of first.global_settings.narration_voice.clips) {
    const wav = readFileSync(join(testWork, clip.asset));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.ok(wav.length > 1000);
  }
  await page.evaluate(() => { window.__listen = []; const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__listen.push(this.src); return play.call(this); }; });
  await page.getByTestId('narration-listen').click();
  await page.waitForFunction(() => window.__listen?.some(src => src.includes('.wav')));
  report.passed.push('Primera voz local generada desde interfaz, guardada y reproducida, con PATH mínimo y variables externas inválidas.');
  await page.getByTestId('modal-close').click();
  const edited = `${await page.getByTestId('prose').inputValue()} Elisa sonrió: lo pequeño también puede abrirse camino.`;
  await page.getByTestId('prose').fill(edited);
  await page.getByTestId('save').click();
  await page.getByTestId('open-narration').click();
  await page.getByTestId('narration-update').click();
  await waitNarration(page, '1 frase nueva', 180000);
  const revised = manifest();
  assert.ok(revised.global_settings.narration_voice.clips.some(clip => clip.text === edited));
  await page.getByTestId('narration-update').click();
  await waitNarration(page, '0 frases nuevas', 60000);
  report.passed.push('Edición e incremento de una frase; siguiente actualización sin regeneración.');
  await page.screenshot({ path: join(scratch, 'voz-local-instalada.png'), fullPage: true });
  await page.getByTestId('modal-close').click();
  await page.getByTestId('open-export').click();
  await page.getByTestId('export-native').click();
  await page.getByTestId('export-next-steps').waitFor({ timeout: 180000 });
  const readers = allFiles(join(testWork, 'export')).filter(path => /\.exe$/i.test(path));
  assert.equal(readers.length, 1);
  assert.ok(statSync(readers[0]).size > 1000000);
  report.passed.push('Lector portátil exportado desde el Studio instalado.');
  assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, []);
  await browser.close(); browser = undefined;
  spawnSync(join(system32, 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  const { page: reader } = await launchApp(readers[0]);
  await reader.addInitScript(() => {
    window.__recordedEnds = 0; window.__systemSpeech = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (!this.loop) { this.playbackRate.value = 20; this.addEventListener('ended', () => window.__recordedEnds++); }
      return start.apply(this, args);
    };
    speechSynthesis.speak = utterance => window.__systemSpeech.push(utterance.text);
  });
  await reader.reload();
  await reader.getByTestId('begin').click({ timeout: 60000 });
  assert.equal(await reader.getByTestId('toggle-sound').getAttribute('aria-pressed'), 'false');
  await reader.getByTestId('toggle-sound').click();
  await reader.getByTestId('toggle-screenless').click();
  await reader.getByTestId('screenless-stage').waitFor();
  await reader.waitForFunction(() => window.__recordedEnds >= 2, undefined, { timeout: 60000 });
  assert.deepEqual(await reader.evaluate(() => window.__systemSpeech), []);
  await reader.screenshot({ path: join(scratch, 'lector-portatil.png'), fullPage: true });
  report.passed.push('Lector exportado reproduce grabaciones sin voz del sistema; sonido apagado inicialmente, entorno mínimo.');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack ?? String(error);
  const failurePage = browser?.contexts()[0]?.pages()[0];
  await failurePage?.screenshot({ path: join(scratch, 'error-instalacion.png'), fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  await browser?.close().catch(() => undefined);
  for (const child of launched) spawnSync(join(system32, 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  writeFileSync(join(scratch, 'VERIFICACION-INSTALACION.json'), JSON.stringify(report, null, 2));
  console.log(`Informe: ${join(scratch, 'VERIFICACION-INSTALACION.json')}`);
}
