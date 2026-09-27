<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { SCREEN_COLORS, TerminalParams } from './params';
import { TerminalMachine } from './terminalParser';

const props = defineProps<{ parameters: Record<string, unknown>; title?: string }>();
const emit = defineEmits<{ success: []; failure: []; feedback: [kind: 'click' | 'error' | 'ok'] }>();

const config = computed(() => TerminalParams.parse(props.parameters));
const machine = new TerminalMachine(config.value);
const lines = ref<string[]>([...config.value.boot_lines]);
const input = ref('');
const finished = ref(false);
const screen = ref<HTMLElement | null>(null);
const color = computed(() => SCREEN_COLORS[config.value.screen_type]);

async function submit() {
  if (finished.value) return;
  const command = input.value;
  input.value = '';
  const result = machine.run(command);
  if (result.clear) lines.value = [];
  else lines.value.push(`${config.value.prompt} ${command}`, ...result.output);
  if (result.outcome) {
    finished.value = true;
    emit('feedback', result.outcome === 'success' ? 'ok' : 'error');
    if (result.outcome === 'success') emit('success');
    else emit('failure');
  } else emit('feedback', 'click');
  await nextTick();
  screen.value?.scrollTo?.({ top: screen.value.scrollHeight });
}
</script>

<template>
  <div class="dv-crt" :style="{ '--crt': color }" data-testid="crt-terminal">
    <div ref="screen" class="dv-crt-screen" role="log" aria-live="polite" :aria-label="title || 'Terminal'">
      <p v-for="(line, i) in lines" :key="i" class="dv-crt-line">{{ line }}</p>
    </div>
    <form class="dv-crt-input" @submit.prevent="submit">
      <label class="sr-only" for="dv-crt-cmd">Orden para la terminal</label>
      <span aria-hidden="true">{{ config.prompt }}</span>
      <input id="dv-crt-cmd" v-model="input" :disabled="finished" autocomplete="off" spellcheck="false" data-testid="crt-input" />
    </form>
  </div>
</template>
