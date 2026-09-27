import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// En entornos con Chromium preinstalado (p. ej. contenedores) se usa ese binario.
const localChromium = process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...(localChromium ? { launchOptions: { executablePath: localChromium } } : {}),
  },
  webServer: {
    command: 'npx vite build --mode player && npx vite build && npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
