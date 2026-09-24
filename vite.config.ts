/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { renameSync, existsSync } from 'node:fs';

// Dos entradas: el Studio (editor completo) y el Player (runtime aislado para exportación).
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
