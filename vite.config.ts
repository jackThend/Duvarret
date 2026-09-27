/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { renameSync, existsSync, cpSync, createReadStream, statSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

// Dos entradas: el Studio (editor completo) y el Player (runtime aislado para exportación).
const WORKS_DIR = fileURLToPath(new URL('./works', import.meta.url));
const WORK_FILES = ['manifest', 'assets', 'knowledge', 'project.duvarret.json'];
const MIME: Record<string, string> = { '.json': 'application/json', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.db': 'application/octet-stream' };

export default defineConfig(({ mode }) => {
  const isPlayer = mode === 'player';
  return {
    base: './',
    plugins: [
      vue(),
      tailwindcss(),
      {
        // El reproductor se publica como index.html (Web/PWA y binario nativo).
        name: 'duvarret-player-index',
        apply: 'build',
        closeBundle() {
          const from = fileURLToPath(new URL('./dist-player/player.html', import.meta.url));
          if (isPlayer && existsSync(from)) renameSync(from, fileURLToPath(new URL('./dist-player/index.html', import.meta.url)));
        },
      },
      {
        // Las obras de ejemplo (`works/*.duvarret`) se sirven en desarrollo y se copian al build del Studio.
        name: 'duvarret-works',
        configureServer(server) {
          server.middlewares.use('/works', (req, res, next) => {
            const path = normalize(decodeURIComponent((req.url ?? '').split('?')[0]!)).replace(/^([/\\])+/, '');
            const full = join(WORKS_DIR, path);
            if (!full.startsWith(WORKS_DIR) || !existsSync(full) || !statSync(full).isFile()) return next();
            res.setHeader('Content-Type', MIME[extname(full)] ?? 'application/octet-stream');
            createReadStream(full).pipe(res);
          });
        },
        closeBundle() {
          if (isPlayer || mode === 'test') return;
          // El runtime del reproductor viaja dentro del Studio para exportar sin herramientas externas.
          const player = fileURLToPath(new URL('./dist-player', import.meta.url));
          if (existsSync(join(player, 'index.html'))) {
            const target = fileURLToPath(new URL('./dist/player', import.meta.url));
            cpSync(player, target, { recursive: true });
            const list: string[] = [];
            const walk = (dir: string, prefix = '') => {
              for (const entry of readdirSync(dir)) {
                const full = join(dir, entry);
                if (statSync(full).isDirectory()) walk(full, `${prefix}${entry}/`);
                else list.push(`${prefix}${entry}`);
              }
            };
            walk(target);
            writeFileSync(join(target, 'files.json'), JSON.stringify(list.filter((f) => f !== 'files.json')));
          }
          if (!existsSync(WORKS_DIR)) return;
          const out = fileURLToPath(new URL('./dist/works', import.meta.url));
          for (const work of ['el-corazon-delator.duvarret']) {
            for (const entry of WORK_FILES) {
              const from = join(WORKS_DIR, work, entry);
              if (existsSync(from)) cpSync(from, join(out, work, entry), { recursive: true });
            }
          }
        },
      },
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    clearScreen: false,
    server: { port: 1420, strictPort: true },
    build: {
      outDir: isPlayer ? 'dist-player' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        input: isPlayer
          ? fileURLToPath(new URL('./player.html', import.meta.url))
          : fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
      testTimeout: 20000,
    },
  };
});
