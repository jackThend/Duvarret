/** Acceso al sistema de archivos para la CLI (Node): proyectos `.duvarret`, runtime y exportaciones. */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { FileMap } from '../../src/core/compiler';

export const REPO_ROOT = resolve(import.meta.dirname, '../..');

export function readTree(dir: string): FileMap {
  const files: FileMap = new Map();
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(relative(dir, full).split(sep).join('/'), new Uint8Array(readFileSync(full)));
    }
  };
  if (existsSync(dir)) walk(dir);
  return files;
}

export function writeTree(dir: string, files: FileMap) {
  for (const [path, data] of files) {
    const target = resolve(dir, path);
    if (!target.startsWith(resolve(dir) + sep)) throw new Error(`Ruta no permitida: ${path}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
}

export interface ProjectOnDisk {
  root: string;
  manifestText: string;
  meta: Record<string, unknown>;
  readAsset: (path: string) => Promise<Uint8Array | null>;
}

export function loadProject(root: string): ProjectOnDisk {
  const dir = resolve(root);
  const manifestPath = join(dir, 'manifest/story_manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`No se encontró ${manifestPath}`);
  const metaPath = join(dir, 'project.duvarret.json');
  return {
    root: dir,
    manifestText: readFileSync(manifestPath, 'utf8'),
    meta: existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>) : {},
    readAsset: async (path) => {
      const full = resolve(dir, path);
      if (!full.startsWith(dir + sep) || !existsSync(full)) return null;
      return new Uint8Array(readFileSync(full));
    },
  };
}

/** Runtime base del reproductor; se compila si aún no existe. */
export function ensurePlayerRuntime(): FileMap {
  const dist = join(REPO_ROOT, 'dist-player');
  if (!existsSync(join(dist, 'index.html'))) {
    execFileSync('npx', ['vite', 'build', '--mode', 'player'], { cwd: REPO_ROOT, stdio: 'inherit' });
  }
  return readTree(dist);
}

export function hasCommand(cmd: string): boolean {
  return spawnSync(cmd, ['-version'], { stdio: 'ignore' }).status === 0;
}

/** Optimizador opcional con ffmpeg: audio a Ogg/Opus e imágenes a WebP (si está instalado). */
export function ffmpegOptimizer() {
  if (!hasCommand('ffmpeg')) return undefined;
  return async (path: string, data: Uint8Array) => {
    const audio = /\.(wav|flac|aiff?)$/i.test(path);
    const image = /\.(png|jpe?g)$/i.test(path);
    if (!audio && !image) return null;
    const work = mkdtempSync(join(tmpdir(), 'duvarret-opt-'));
    try {
      const input = join(work, `in${path.slice(path.lastIndexOf('.'))}`);
      const outExt = audio ? '.ogg' : '.webp';
      const output = join(work, `out${outExt}`);
      writeFileSync(input, data);
      const args = audio ? ['-y', '-i', input, '-c:a', 'libopus', '-b:a', '96k', output] : ['-y', '-i', input, '-c:v', 'libwebp', '-quality', '82', output];
      if (spawnSync('ffmpeg', args, { stdio: 'ignore' }).status !== 0) return null;
      return { path: path.replace(/\.[^.]+$/, outExt), data: new Uint8Array(readFileSync(output)) };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  };
}
