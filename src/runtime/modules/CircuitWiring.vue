<script setup lang="ts">
import { computed, ref } from 'vue';
import { nextRandom } from '../engine/rng';
import { CircuitParams } from './params';

const props = defineProps<{ parameters: Record<string, unknown>; title?: string }>();
const emit = defineEmits<{ success: []; failure: []; feedback: [kind: 'click' | 'error' | 'ok'] }>();

const PALETTE: Record<string, string> = {
  rojo: '#ef4444', azul: '#3b82f6', amarillo: '#eab308', verde: '#22c55e', blanco: '#e5e7eb', naranja: '#f97316', violeta: '#a855f7', cian: '#06b6d4',
};

const config = computed(() => CircuitParams.parse(props.parameters));
/** Orden determinista de los bornes de la derecha (Fisher-Yates con semilla). */
const right = computed(() => {
  const order = [...config.value.colors];
  let state = config.value.seed;
  for (let i = order.length - 1; i > 0; i--) {
    const r = nextRandom(state);
    state = r.state;
    const j = Math.floor(r.value * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
});

const selected = ref<string | null>(null);
const connected = ref<string[]>([]);
const mistakes = ref(0);
const done = ref(false);

function pickLeft(color: string) {
  if (done.value || connected.value.includes(color)) return;
  selected.value = color;
  emit('feedback', 'click');
}

function pickRight(color: string) {
  if (done.value || !selected.value) return;
  if (selected.value === color) {
    connected.value.push(color);
    emit('feedback', 'ok');
    if (connected.value.length === config.value.colors.length) {
      done.value = true;
      emit('success');
    }
  } else {
    mistakes.value++;
    emit('feedback', 'error');
    if (mistakes.value >= config.value.max_mistakes) {
      done.value = true;
      emit('failure');
    }
  }
  selected.value = null;
}

const swatch = (c: string) => PALETTE[c] ?? c;
</script>

<template>
  <div class="dv-circuit" data-testid="circuit-wiring">
    <p class="dv-circuit-title">{{ title || 'Restablece la energía uniendo cada cable con su borne' }}</p>
    <div class="dv-circuit-board">
      <div class="dv-circuit-col" role="group" aria-label="Cables">
        <button
          v-for="c in config.colors"
          :key="c"
          type="button"
          class="dv-terminal"
          :class="{ 'is-selected': selected === c, 'is-done': connected.includes(c) }"
          :style="{ '--wire': swatch(c) }"
          :aria-pressed="selected === c"
          :aria-label="`Cable ${c}${connected.includes(c) ? ', conectado' : ''}`"
          :data-testid="`left-${c}`"
          @click="pickLeft(c)"
        >{{ c }}</button>
      </div>
      <div class="dv-circuit-col" role="group" aria-label="Bornes">
        <button
          v-for="c in right"
          :key="c"
          type="button"
          class="dv-terminal"
          :class="{ 'is-done': connected.includes(c) }"
          :style="{ '--wire': swatch(c) }"
          :aria-label="`Borne ${c}`"
          :data-testid="`right-${c}`"
          @click="pickRight(c)"
        >●</button>
      </div>
    </div>
    <p role="status" class="dv-circuit-status">Chispazos: {{ mistakes }} / {{ config.max_mistakes }}</p>
  </div>
</template>
