<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useStoryStore } from '../stores/story';
import { useRuntimeServices } from '../services';
import { HELP_TEXT, ScreenlessController } from '../screenless/ScreenlessController';

const emit = defineEmits<{ exit: [] }>();
const store = useStoryStore();
const services = useRuntimeServices();
const controller = new ScreenlessController(store, services.announcer, services.audio);
const stage = ref<HTMLElement | null>(null);
const listening = ref(false);

type Recognition = { lang: string; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };
const RecognitionCtor = (globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
  .SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
let recognition: Recognition | null = null;

function toggleVoice() {
  if (!RecognitionCtor) {
    services.announcer.say('El reconocimiento de voz no está disponible en este dispositivo; usa el teclado.');
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
    <p class="dv-screenless-hint" aria-hidden="true">🎧 Cierra los ojos · Números para elegir · Espacio para continuar · H ayuda · Esc salir</p>
  </section>
</template>

<style scoped>
.dv-screenless {
  position: absolute;
  inset: 0;
  background: #000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1.5rem;
  z-index: 30;
}
.dv-screenless:focus {
  outline: none;
}
.dv-screenless-hint {
  color: #3a3f47;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
}
</style>
