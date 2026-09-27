<script setup lang="ts">
import { computed, onErrorCaptured, ref, toRaw, type Component } from 'vue';
import type { GameplayOverlay, ModuleType } from '@/core/manifest';
import { MODULE_LABELS } from '@/core/manifest';
import CipherLock from './CipherLock.vue';
import CrtTerminal from './CrtTerminal.vue';
import CircuitWiring from './CircuitWiring.vue';
import FictionalDesktop from './FictionalDesktop.vue';

/**
 * Caja de arena de los minijuegos (doc 02 §5.3, RNF-08): el módulo recibe una copia congelada
 * de sus condiciones de inicio y solo puede devolver `success` o `failure`. Cualquier error
 * interno queda contenido aquí y la lectura principal continúa.
 */
const props = defineProps<{ overlay: GameplayOverlay; solved?: boolean }>();
const emit = defineEmits<{ resolve: [success: boolean]; feedback: [kind: 'click' | 'error' | 'ok'] }>();

const MODULES: Record<ModuleType, Component> = {
  cipher_lock: CipherLock,
  crt_terminal: CrtTerminal,
  circuit_wiring: CircuitWiring,
  fictional_desktop: FictionalDesktop,
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Copia profunda por serialización: los parámetros son datos declarativos puros.
const parameters = computed(() => deepFreeze(JSON.parse(JSON.stringify(toRaw(props.overlay.parameters))) as Record<string, unknown>));
const crashed = ref(false);
const attempt = ref(0);
const finished = ref(false);

onErrorCaptured(() => {
  crashed.value = true;
  return false; // detiene la propagación: el error no alcanza a la historia
});

function settle(success: boolean) {
  if (finished.value) return;
  finished.value = true;
  emit('resolve', success);
}

function retry() {
  crashed.value = false;
  finished.value = false;
  attempt.value++;
}
</script>

<template>
  <section class="dv-sandbox" data-testid="module-sandbox" :aria-label="overlay.title || MODULE_LABELS[overlay.type]">
    <header class="dv-sandbox-head">
      <span>{{ overlay.title || MODULE_LABELS[overlay.type] }}</span>
      <button v-if="!solved && !finished && !crashed" type="button" class="dv-sandbox-giveup" data-testid="sandbox-giveup" @click="settle(false)">Abandonar</button>
    </header>
    <div v-if="crashed" class="dv-sandbox-crash" role="alert" data-testid="sandbox-crash">
      <p>El mecanismo se ha trabado.</p>
      <button type="button" @click="retry">Intentar de nuevo</button>
      <button type="button" @click="settle(false)">Seguir leyendo</button>
    </div>
    <p v-else-if="solved" class="dv-sandbox-solved">Resuelto.</p>
    <component
      :is="MODULES[overlay.type]"
      v-else
      :key="attempt"
      :parameters="parameters"
      :title="overlay.title"
      @success="settle(true)"
      @failure="settle(false)"
      @feedback="(k: 'click' | 'error' | 'ok') => emit('feedback', k)"
    />
  </section>
</template>
