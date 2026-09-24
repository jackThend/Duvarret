/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Dos entradas: el Studio (editor completo) y el Player (runtime aislado para exportación).
export default defineConfig(({ mode }) => {
  const isPlayer = mode === 'player';
  return {
    base: './',
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    clearScreen: false,
    server: { port: 1420, strictPort: true },
    build: {
      outDir: isPlayer ? 'dist-player' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
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
