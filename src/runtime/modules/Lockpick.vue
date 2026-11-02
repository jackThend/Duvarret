<script setup lang="ts">
import { computed, ref } from 'vue';
import { LockpickParams } from './params';

const props = defineProps<{ parameters: Record<string, unknown>; title?: string }>();
const emit = defineEmits<{ success: []; failure: []; feedback: [kind: 'click' | 'error' | 'ok'] }>();
const config = computed(() => LockpickParams.parse(props.parameters));
const heights = ref([0, 0, 0]);
const fixed = ref([false, false, false]);
const mistakes = ref(0);
const done = ref(false);
const message = ref('Ajusta la altura de cada perno y pulsa Fijar.');

function adjust(index: number, value: number) {
  if (done.value || fixed.value[index]) return;
  heights.value[index] = Math.max(0, Math.min(4, value));
}

function onKey(event: KeyboardEvent, index: number) {
  const current = heights.value[index] ?? 0;
  const values: Record<string, number> = {
    ArrowUp: current + 1, ArrowRight: current + 1,
    ArrowDown: current - 1, ArrowLeft: current - 1,
    Home: 0, End: 4,
  };
  const value = values[event.key];
  if (value === undefined) return;
  event.preventDefault();
  adjust(index, value);
}

function fixPin(index: number) {
  if (done.value || fixed.value[index]) return;
  if (heights.value[index] !== config.value.pin_heights[index]) {
    mistakes.value++;
    emit('feedback', 'error');
    if (mistakes.value >= config.value.max_attempts) {
      done.value = true;
      message.value = 'La ganzúa se ha roto. No quedan intentos.';
      emit('failure');
    } else {
      message.value = `El perno ${index + 1} no encaja. Ajusta su altura y vuelve a fijarlo.`;
    }
    return;
  }
  fixed.value[index] = true;
  emit('feedback', 'ok');
  message.value = `Perno ${index + 1} fijado.`;
  if (fixed.value.every(Boolean)) {
    done.value = true;
    message.value = 'Cerradura abierta.';
    emit('success');
  }
}
</script>

<template>
  <div class="dv-crt dv-lockpick" data-testid="lockpick">
    <p class="dv-crt-line">{{ title || 'Cerradura de ganzúa' }}</p>
    <p class="dv-lockpick-help">Tres pernos, alturas de 0 a 4. Usa el deslizador o las flechas; Tab lleva al botón Fijar.</p>
    <div class="dv-lockpick-pins">
      <fieldset v-for="(_, index) in heights" :key="index" class="dv-lockpick-pin" :disabled="done || fixed[index]">
        <legend>Perno {{ index + 1 }}{{ fixed[index] ? ' · fijado' : '' }}</legend>
        <label>
          Altura: {{ heights[index] }} / 4
          <input
            type="range" min="0" max="4" step="1"
            :value="heights[index]"
            :aria-label="`Altura del perno ${index + 1}`"
            :data-testid="`pin-height-${index}`"
            @input="adjust(index, Number(($event.target as HTMLInputElement).value))"
            @keydown="onKey($event, index)"
          />
        </label>
        <button type="button" class="dv-lock-key" :data-testid="`pin-fix-${index}`" @click="fixPin(index)">
          Fijar perno {{ index + 1 }}
        </button>
      </fieldset>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" data-testid="lockpick-status">
      {{ message }} Intentos restantes: {{ config.max_attempts - mistakes }}.
    </p>
  </div>
</template>

<style scoped>
.dv-lockpick { --crt: var(--dv-story-accent, #d97706); display: grid; gap: 1rem; }
.dv-lockpick-help { font-size: 0.9rem; line-height: 1.6; }
.dv-lockpick-pins { display: flex; flex-wrap: wrap; gap: 1rem; }
.dv-lockpick-pin { flex: 1 1 10rem; min-width: 0; border: 1px solid currentColor; padding: 0.75rem; display: grid; gap: 0.75rem; }
.dv-lockpick-pin label { display: grid; gap: 0.5rem; }
.dv-lockpick-pin input { width: 100%; min-height: 2.75rem; accent-color: var(--crt); }
.dv-lockpick-pin button { min-height: 2.75rem; padding: 0.5rem; }
.dv-lockpick-pin :focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.dv-lockpick-pin:disabled { opacity: 0.65; }
</style>
