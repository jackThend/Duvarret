<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useStoryStore } from '../stores/story';
import { useRuntimeServices } from '../services';
import { HELP_TEXT, ScreenlessController } from '../screenless/ScreenlessController';
import { VOICE_UNAVAILABLE } from '@/core/narration/script';

const props = withDefaults(defineProps<{ soundEnabled?: boolean }>(), { soundEnabled: true });
const emit = defineEmits<{ exit: []; toggleSound: [] }>();
const store = useStoryStore();
const services = useRuntimeServices();
const controller = new ScreenlessController(store, services.announcer, services.audio);
const touchOptions = computed(() => controller.buildOptions());
const stage = ref<HTMLElement | null>(null);
const listening = ref(false);
const enteredCode = ref('');
const codeEntry = computed(() => store.puzzlePending && typeof store.currentNode?.gameplay_overlay?.parameters.target_code === 'string');
function submitTouchCode() {
  controller.submitCodeText(enteredCode.value);
  enteredCode.value = '';
}
watch(() => props.soundEnabled, enabled => { if (enabled) controller.handleKey('r'); });

type Recognition = { lang: string; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };
const RecognitionCtor = (globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
  .SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
let recognition: Recognition | null = null;

function toggleVoice() {
  if (!RecognitionCtor) {
    services.announcer.say(VOICE_UNAVAILABLE);
    return;
  }
  if (listening.value) {
    recognition?.stop();
    return;
  }
  recognition = new RecognitionCtor();
  recognition.lang = store.manifest?.metadata.language ?? 'es-ES';
  recognition.onresult = (e) => {
    const transcript = e.results[0]?.[0]?.transcript;
    if (transcript) controller.handleVoice(transcript);
  };
  recognition.onend = () => (listening.value = false);
  listening.value = true;
  recognition.start();
}

function onKey(event: KeyboardEvent) {
  if (event.target instanceof Element && event.target.closest('input, form')) return;
  // Enter/Espacio sobre un botón deben activar ese botón, sin ejecutar además el atajo global.
  if (event.target instanceof Element && event.target.closest('button') && ['Enter', ' '].includes(event.key)) return;
  if (event.key === 'Escape') {
    emit('exit');
    return;
  }
  if (event.key.toLowerCase() === 'v') {
    toggleVoice();
    event.preventDefault();
    return;
  }
  if (controller.handleKey(event.key)) event.preventDefault();
}

onMounted(() => {
  controller.start();
  stage.value?.focus();
});
onBeforeUnmount(() => {
  recognition?.stop();
  controller.stop();
});

defineExpose({ controller });
</script>

<template>
  <section
    ref="stage"
    class="dv-screenless"
    data-testid="screenless-stage"
    tabindex="0"
    role="application"
    aria-roledescription="Audio-drama"
    :aria-label="`Modo sin pantalla. ${HELP_TEXT} Escape para volver a la pantalla, V para hablar.`"
    @keydown="onKey"
  >
    <div class="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-polite">{{ services.announcer.polite.value }}</div>
    <div class="sr-only" aria-live="assertive" aria-atomic="true" data-testid="live-assertive">{{ services.announcer.assertive.value }}</div>
    <div class="dv-screenless-controls" aria-label="Controles de escucha">
      <p class="dv-screenless-hint">{{ soundEnabled ? '🎧 Escucha y elige cuando quieras.' : 'El sonido está apagado. Actívalo para escuchar.' }}</p>
      <button type="button" data-testid="screenless-sound" :aria-pressed="soundEnabled" @click="emit('toggleSound')">{{ soundEnabled ? 'Apagar sonido' : 'Activar sonido' }}</button>
      <form v-if="codeEntry" @submit.prevent="submitTouchCode">
        <label>Código <input v-model="enteredCode" data-testid="screenless-code" inputmode="numeric" autocomplete="off" maxlength="40" /></label>
        <button type="submit">Probar código</button>
      </form>
      <button v-for="option in touchOptions" :key="`${store.currentNodeId}-${option.key}`" type="button" :data-testid="`screenless-choice-${option.key}`" @click="controller.handleKey(option.key)">{{ option.label }}</button>
      <button v-if="store.canAdvance && !touchOptions.length" type="button" data-testid="screenless-continue" @click="controller.handleKey('Enter')">Continuar</button>
      <div class="dv-screenless-actions">
        <button type="button" data-testid="screenless-repeat" @click="controller.handleKey('r')">Repetir</button>
        <button v-if="touchOptions.length" type="button" data-testid="screenless-options" @click="controller.handleKey('o')">Oír opciones</button>
        <button type="button" data-testid="screenless-silence" @click="controller.handleKey('s')">Silenciar</button>
        <button type="button" data-testid="screenless-exit" @click="emit('exit')">Volver a la lectura</button>
      </div>
      <p class="dv-screenless-keyboard" aria-hidden="true">Teclado: números para elegir · R repetir · H ayuda · Esc salir</p>
    </div>
    <p v-if="services.announcer.warning.value" role="alert" class="dv-screenless-warning">{{ services.announcer.warning.value }}</p>
  </section>
</template>

<style scoped>
.dv-screenless {
  position: absolute;
  inset: 0;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-direction: column;
  padding: 1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
  z-index: 30;
}
.dv-screenless:focus {
  outline: none;
}
:global(.dv-player:not(.dv-embedded) > .dv-screenless) { position: fixed; overflow-y: auto; }
.dv-screenless-hint {
  color: #b8bdc6;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
}
.dv-screenless-controls { width: min(100%, 34rem); display: grid; gap: 0.65rem; }
.dv-screenless-controls button { min-height: 44px; padding: 0.65rem 0.9rem; color: #e7e8ec; border: 1px solid #50545c; border-radius: 0.5rem; background: #14161a; text-align: left; cursor: pointer; font: inherit; }
.dv-screenless-controls button:hover { background: #24272e; }
.dv-screenless-controls button:focus-visible { outline: 2px solid #e9b667; outline-offset: 3px; }
.dv-screenless-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.dv-screenless-keyboard { color: #a0a5af; font-size: 0.75rem; }
@media (pointer: coarse) { .dv-screenless-keyboard { display: none; } }
.dv-screenless-warning { position: absolute; top: 2rem; max-width: 40rem; color: #eee5d0; padding: 1rem; }
</style>
