/**
 * Compila Duvarret Studio de escritorio con el reproductor portátil incluido como recurso,
 * para que la exportación a ejecutable funcione con un clic y sin herramientas instaladas.
 *
 *   npm run build:desktop
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
const exe = process.platform === 'win32' ? '.exe' : '';

// 1) Reproductor genérico (lee la obra de la carpeta obra/ vía obra://).
run('npx', ['vite', 'build', '--mode', 'player']);
run('npx', ['tauri', 'build', '--no-bundle', '--config', 'src-tauri/tauri.player.conf.json', '--config', JSON.stringify({ build: { beforeBuildCommand: '' } })]);
const built = join(ROOT, 'src-tauri/target/release', `duvarret${exe}`);
if (!existsSync(built)) throw new Error('No se generó el reproductor.');
mkdirSync(join(ROOT, 'dist-native-player'), { recursive: true });
const player = join(ROOT, 'dist-native-player', `duvarret-player${exe}`);
copyFileSync(built, player);
console.log(`✓ Reproductor: ${(statSync(player).size / 1024 / 1024).toFixed(2)} MB`);

// 2) Studio con el reproductor como recurso.
const resources = { [`../dist-native-player/duvarret-player${exe}`]: `player/duvarret-player${exe}` };
run('npx', ['tauri', 'build', '--config', JSON.stringify({ bundle: { resources } })]);
