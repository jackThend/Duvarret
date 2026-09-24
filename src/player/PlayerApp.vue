<script setup lang="ts">
import { onMounted, ref } from 'vue';
import RuntimePlayer from '@/runtime/components/RuntimePlayer.vue';
import { isTauri } from '@/core/lore/tauriDriver';

/**
 * Reproductor aislado. Busca la obra empaquetada junto al runtime (Web/PWA o binario con la
 * obra incrustada) y, en el ejecutable portátil, en la carpeta `obra/` vía el protocolo `obra://`.
 */
const manifest = ref<Record<string, unknown> | null>(null);
const assetBase = ref('.');
const error = ref('');

function obraBase() {
  return /windows|android/i.test(navigator.userAgent) ? 'http://obra.localhost' : 'obra://localhost';
}

async function tryLoad(base: string) {
  const response = await fetch(`${base}/manifest/story_manifest.json`);
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as Record<string, unknown>;
}

onMounted(async () => {
  const bases = ['.', ...(isTauri() ? [obraBase()] : [])];
  for (const base of bases) {
    try {
      manifest.value = await tryLoad(base);
      assetBase.value = base;
      break;
    } catch {
      /* se prueba la siguiente ubicación */
    }
  }
  if (!manifest.value) {
    error.value = 'No se encontró la obra empaquetada.';
    return;
  }
  const title = (manifest.value.metadata as { title?: string } | undefined)?.title;
  if (title) document.title = title;
  // Aplicación instalable: la obra queda disponible sin conexión.
  if (!isTauri() && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
});
</script>

<template>
  <RuntimePlayer
    v-if="manifest"
    :manifest="manifest"
    :asset-base="assetBase"
    :persist-key="`duvarret:partida:${String((manifest.metadata as { title?: string })?.title ?? 'obra')}`"
  />
  <p v-else-if="error" style="padding: 2rem; font-family: serif">{{ error }}</p>
</template>
