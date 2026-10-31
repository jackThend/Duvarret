/**
 * Compila Duvarret Studio de escritorio con el reproductor portátil incluido como recurso,
 * para que la exportación a ejecutable funcione con un clic y sin herramientas instaladas.
 *
 *   npm run build:desktop
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runLocalCli } from './lib/projectFs';

const ROOT = resolve(import.meta.dirname, '..');
const exe = process.platform === 'win32' ? '.exe' : '';
const bundleArgs = process.argv.includes('--no-bundle') ? ['--no-bundle'] : [];
const reusePlayer = process.argv.includes('--reuse-player');
const player = join(ROOT, 'dist-native-player', `duvarret-player${exe}`);

// El Studio Windows siempre lleva su motor; nunca depende de Python instalado.
if (process.platform === 'win32') execFileSync(process.execPath, [join(ROOT, 'scripts/prepare-voice.mjs')], { cwd: ROOT, stdio: 'inherit' });

// 1) Reproductor genérico (lee la obra de la carpeta obra/ vía obra://).
if (reusePlayer) {
  if (process.platform !== 'win32' || !existsSync(player)) throw new Error('Reutilizar requiere un reproductor Windows ya compilado y comprobado.');
  const binary = readFileSync(player);
  if (binary.length < 1_000_000 || binary.toString('ascii', 0, 2) !== 'MZ') throw new Error('El reproductor existente no es un ejecutable Windows válido.');
  console.log(`✓ Reproductor reutilizado, SHA256 ${createHash('sha256').update(binary).digest('hex')}`);
} else {
  runLocalCli('vite', ['build', '--mode', 'player']);
  runLocalCli('tauri', ['build', '--no-bundle', '--config', 'src-tauri/tauri.player.conf.json', '--config', JSON.stringify({ build: { beforeBuildCommand: '' } })]);
  const built = join(ROOT, 'src-tauri/target/release', `duvarret${exe}`);
  if (!existsSync(built)) throw new Error('No se generó el reproductor.');
  mkdirSync(join(ROOT, 'dist-native-player'), { recursive: true });
  copyFileSync(built, player);
}
console.log(`✓ Reproductor: ${(statSync(player).size / 1024 / 1024).toFixed(2)} MB`);

// 2) Studio con el reproductor como recurso.
const resources: Record<string, string> = { [`../dist-native-player/duvarret-player${exe}`]: `player/duvarret-player${exe}` };
if (process.platform === 'win32') resources['../dist-voice/'] = 'voice/';
const windows = process.platform === 'win32'
  ? { targets: ['nsis'], useLocalToolsDir: true, windows: { webviewInstallMode: { type: 'offlineInstaller' }, nsis: { languages: ['Spanish'], displayLanguageSelector: false, installMode: 'currentUser' } } }
  : {};
runLocalCli('tauri', ['build', ...bundleArgs, '--config', JSON.stringify({ bundle: { ...windows, resources } })]);
