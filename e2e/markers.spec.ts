import { expect, test } from '@playwright/test';
import { validateManifest } from '../src/core/manifest/validator';
import { encodeWav } from '../src/core/assets/wav';

test('libro contemplativo: el scroll dispara la marca una sola vez en el reproductor exportado', async ({ page }) => {
  const paragraph = 'El camino seguía entre los árboles, sin ruido y sin nadie a la vista. '.repeat(12);
  const manifest = validateManifest({
    metadata: { title: 'Sonidos al leer' },
    global_settings: { default_mode: 'contemplative_book', audio_engine: 'stereo_simple' },
    nodes: [{ node_id: 'camino', text_payload: `${paragraph}\n\n${paragraph}\n\nCrujió una rama.⟦rama⟧\n\n${paragraph}`, navigation: { is_ending: true },
      acoustic_events: [{ event_id: 'rama', asset: 'assets/audio/rama.wav', trigger: 'on_text_marker', trigger_marker: 'rama' }],
    }],
  }).manifest;
  await page.route('**/manifest/story_manifest.json', route => route.fulfill({ json: manifest }));
  await page.route('**/assets/audio/rama.wav', route => route.fulfill({ contentType: 'audio/wav', body: Buffer.from(encodeWav(new Float32Array(2400), 24000)) }));
  await page.addInitScript(() => {
    localStorage.clear();
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      document.documentElement.dataset.played = String(Number(document.documentElement.dataset.played ?? 0) + 1);
      return original.apply(this, args);
    };
  });
  await page.goto('/player/index.html');
  await page.getByTestId('toggle-sound').click();
  await page.getByTestId('begin').click();
  const anchor = page.locator('[data-marker="rama"]');
  await expect(anchor).toHaveCount(1);
  await expect(page.getByTestId('node-view')).not.toContainText('⟦');
  // Completar el progreso estimado no debe disparar las marcas del modo contemplativo.
  await page.getByTestId('skip-reading').evaluate(el => (el as HTMLButtonElement).click());
  await expect(page.locator('html')).not.toHaveAttribute('data-played');
  await anchor.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await expect(page.locator('html')).toHaveAttribute('data-played', '1');
  await page.locator('.dv-player').evaluate(el => { el.scrollTop = 0; });
  await anchor.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await expect(page.locator('html')).toHaveAttribute('data-played', '1');
});
