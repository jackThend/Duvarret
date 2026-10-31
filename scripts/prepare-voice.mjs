/** Prepara el motor Windows x64 sin pip ni Python del sistema. Solo construcción. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchVoiceRuntime } from './patch-voice-runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist-voice');
const cache = join(root, '.cache/native-build/downloads');
const archive = join(cache, 'python-3.12.10-embed-amd64.zip');
const pythonSha = '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3';
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const walk = directory => readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

export function prepareVoice() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('El paquete de voz preparado es Windows x64.');
  if (!existsSync(archive)) throw new Error('Falta Python embebido oficial: sigue docs/10_MOTOR_VOZ_INCLUIDO.md. No se descarga durante la narración.');
  if (sha(archive) !== pythonSha) throw new Error('SHA256 incorrecto del intérprete oficial.');
  // Solo se regenera el destino fijo de construcción; nunca cachés ni proyectos.
  if (output !== join(root, 'dist-voice')) throw new Error('Destino de voz inesperado.');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const pyDir = join(output, 'python');
  mkdirSync(pyDir, { recursive: true });
  // Expand-Archive solo escribe dentro del destino ya conocido. No se elimina la caché original.
  const literal = value => "'" + value.replaceAll("'", "''") + "'";
  const expand = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${literal(archive)} -DestinationPath ${literal(pyDir)} -Force`], { stdio: 'inherit', windowsHide: true });
  if (expand.status !== 0) throw new Error('No se pudo extraer Python embebido.');
  // _pth mantiene la biblioteca estándar aislada; el proceso añade únicamente plan.runtime.
  writeFileSync(join(pyDir, 'python312._pth'), 'python312.zip\n.\n', 'utf8');
  // DLL redistribuibles oficiales app-local: ONNX/eSpeak no dependen del CRT del equipo.
  const crt = join(root, '.cache/native-build/msvc/VC/Redist/MSVC/14.44.35112/x64/Microsoft.VC143.CRT');
  for (const file of ['msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'msvcp140_atomic_wait.dll', 'msvcp140_codecvt_ids.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'concrt140.dll']) {
    const source = join(crt, file);
    if (!existsSync(source)) throw new Error(`Falta DLL redistribuible oficial: ${file}`);
    cpSync(source, join(pyDir, file));
  }
  for (const [source, target] of [['.cache/voz/runtime', 'runtime'], ['.cache/voz/modelos', 'modelos']]) {
    const sourcePath = join(root, source);
    if (!existsSync(sourcePath)) throw new Error(`Falta la dependencia de construcción ${source}.`);
    cpSync(sourcePath, join(output, target), { recursive: true, filter: path => !path.split(/[\\/]/).some(part => ['__pycache__', 'bin', 'test', 'tests', 'docs', '_soundfile_data', 'licensing', 'cffi', 'pycparser'].includes(part) || /^(soundfile|cffi-|pycparser-|_cffi_backend|_soundfile\.py)/.test(part)) && !path.endsWith('.pyc') });
  }
  patchVoiceRuntime(join(output, 'runtime'));
  cpSync(join(root, 'scripts/synthesize-narration.py'), join(output, 'synthesize-narration.py'));
  const licenseDir = join(output, 'licencias');
  mkdirSync(licenseDir, { recursive: true });
  cpSync(join(pyDir, 'LICENSE.txt'), join(licenseDir, 'Python-LICENSE.txt'));
  const localLicenses = join(root, 'scripts/voice-licenses');
  if (!existsSync(localLicenses)) throw new Error('Faltan los avisos de terceros de la voz.');
  cpSync(localLicenses, licenseDir, { recursive: true });
  const packages = readdirSync(join(output, 'runtime')).filter(name => name.endsWith('.dist-info')).sort().map(name => {
    const meta = readFileSync(join(output, 'runtime', name, 'METADATA'), 'utf8');
    return { name: /^Name: (.+)$/m.exec(meta)?.[1].trim(), version: /^Version: (.+)$/m.exec(meta)?.[1].trim() };
  });
  const files = walk(output).filter(path => !['package.json', 'VERIFICACION.txt'].includes(relative(output, path).replaceAll('\\', '/'))).map(path => ({ path: relative(output, path).replaceAll('\\', '/'), bytes: statSync(path).size, sha256: sha(path) }));
  const manifest = { schema: 1, id: 'duvarret-kokoro-es-windows-x64', revision: '2026-10-21.1', python: { version: '3.12.10', source: 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip', sha256: pythonSha }, packages, files };
  writeFileSync(join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ Voz autocontenida: ${files.length} archivos, ${(files.reduce((sum, file) => sum + file.bytes, 0) / 1024 / 1024).toFixed(1)} MiB.`);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepareVoice();
