<script setup lang="ts">
import type { Choice } from '@/core/manifest';

defineProps<{ choices: { choice: Choice; index: number }[]; disabled?: boolean }>();
const emit = defineEmits<{ choose: [index: number]; hover: [index: number] }>();
</script>

<template>
  <nav v-if="choices.length" class="dv-choices" aria-label="Caminos posibles" data-testid="choices">
    <button
      v-for="({ choice, index }, i) in choices"
      :key="index"
      type="button"
      class="dv-choice"
      :disabled="disabled"
      :aria-keyshortcuts="String(i + 1)"
      :data-testid="`choice-${index}`"
      @click="emit('choose', index)"
      @mouseenter="emit('hover', index)"
      @focus="emit('hover', index)"
    >
      <span class="dv-choice-key" aria-hidden="true">{{ i + 1 }}</span>{{ choice.choice_text }}
    </button>
  </nav>
</template>
