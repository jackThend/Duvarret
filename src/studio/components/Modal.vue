<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';

defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
onMounted(async () => {
  await nextTick();
  panel.value?.focus();
});
</script>

<template>
  <div class="dv-modal-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section ref="panel" class="dv-modal" :class="{ 'is-wide': wide }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
      <header class="mb-4 flex items-center justify-between">
        <h2 class="font-prose text-xl">{{ title }}</h2>
        <button type="button" class="dv-icon-btn" aria-label="Cerrar" data-testid="modal-close" @click="emit('close')">✕</button>
      </header>
      <slot />
    </section>
  </div>
</template>
