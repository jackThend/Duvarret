<script setup lang="ts">
import { onMounted, ref } from 'vue';
import RuntimePlayer from '@/runtime/components/RuntimePlayer.vue';

/** Reproductor aislado: lee el manifiesto empaquetado junto al ejecutable o la web. */
const manifest = ref<Record<string, unknown> | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    const response = await fetch('./manifest/story_manifest.json');
    if (!response.ok) throw new Error(String(response.status));
    manifest.value = (await response.json()) as Record<string, unknown>;
    const title = (manifest.value.metadata as { title?: string } | undefined)?.title;
    if (title) document.title = title;
  } catch {
    error.value = 'No se encontró la obra empaquetada.';
  }
});
</script>

<template>
  <RuntimePlayer v-if="manifest" :manifest="manifest" asset-base="." :persist-key="`duvarret:partida:${String((manifest.metadata as { title?: string })?.title ?? 'obra')}`" />
  <p v-else-if="error" style="padding: 2rem; font-family: serif">{{ error }}</p>
</template>
