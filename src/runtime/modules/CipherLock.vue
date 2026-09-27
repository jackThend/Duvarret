<script setup lang="ts">
import { computed, ref } from 'vue';
import { CipherLockParams, SCREEN_COLORS } from './params';

const props = defineProps<{ parameters: Record<string, unknown>; title?: string }>();
const emit = defineEmits<{ success: []; failure: []; feedback: [kind: 'click' | 'error' | 'ok'] }>();

const config = computed(() => CipherLockParams.parse(props.parameters));
const entry = ref('');
const attempts = ref(0);
const message = ref('');
const locked = ref(false);
const color = computed(() => SCREEN_COLORS[config.value.screen_type]);
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '⏎'];

function press(key: string) {
  if (locked.value) return;
  emit('feedback', 'click');
  if (key === '⌫') entry.value = entry.value.slice(0, -1);
  else if (key === '⏎') submit();
  else if (entry.value.length < Math.max(8, config.value.target_code.length)) entry.value += key;
}

function submit() {
  if (!entry.value) return;
  if (entry.value.toUpperCase() === config.value.target_code.toUpperCase()) {
    message.value = 'ACCESO CONCEDIDO';
    locked.value = true;
    emit('feedback', 'ok');
    emit('success');
    return;
  }
  attempts.value++;
  entry.value = '';
  emit('feedback', 'error');
  const left = config.value.max_attempts - attempts.value;
  if (left <= 0) {
    message.value = 'SISTEMA BLOQUEADO';
    locked.value = true;
    emit('failure');
  } else message.value = `CÓDIGO INCORRECTO · ${left} ${left === 1 ? 'INTENTO' : 'INTENTOS'}`;
}

function onKey(event: KeyboardEvent) {
  if (/^[0-9a-zA-Z]$/.test(event.key)) press(event.key);
  else if (event.key === 'Backspace') press('⌫');
  else if (event.key === 'Enter') press('⏎');
  else return;
  event.preventDefault();
}
</script>

<template>
  <div class="dv-crt dv-lock" :style="{ '--crt': color }" tabindex="0" data-testid="cipher-lock" @keydown="onKey">
    <p class="dv-crt-line">{{ title || 'CERRADURA' }}</p>
    <p class="dv-crt-line">{{ config.prompt_text }}</p>
    <p class="dv-lock-display" data-testid="lock-display" aria-live="polite">{{ entry.replace(/./g, '•') || '_' }}</p>
    <p class="dv-crt-line" role="status" data-testid="lock-message">{{ message }}</p>
    <div class="dv-lock-pad" role="group" aria-label="Teclado de la cerradura">
      <button
        v-for="key in keys"
        :key="key"
        type="button"
        class="dv-lock-key"
        :disabled="locked"
        :aria-label="key === '⌫' ? 'Borrar' : key === '⏎' ? 'Confirmar' : key"
        @click="press(key)"
      >{{ key }}</button>
    </div>
  </div>
</template>
