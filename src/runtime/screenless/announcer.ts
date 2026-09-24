/**
 * Anuncios accesibles: región ARIA live + síntesis de voz (Web Speech API) cuando existe.
 * Compatible con lectores de pantalla (NVDA, JAWS, VoiceOver).
 */
import { ref } from 'vue';

export interface SpeakOptions {
  pitch?: number;
  rate?: number;
  lang?: string;
}

export interface Speaker {
  speak(text: string, options?: SpeakOptions): void;
  cancel(): void;
}

export function createSpeechSpeaker(): Speaker | null {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  const Utterance = typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined;
  if (!synth || !Utterance) return null;
  return {
    speak(text, options = {}) {
      const u = new Utterance(text);
      u.lang = options.lang ?? 'es-ES';
      u.pitch = options.pitch ?? 1;
      u.rate = options.rate ?? 1;
      synth.speak(u);
    },
    cancel: () => synth.cancel(),
  };
}

export class Announcer {
  /** Texto de la región `aria-live="polite"`. */
  readonly polite = ref('');
  /** Texto de la región `aria-live="assertive"` (alertas y resultados). */
  readonly assertive = ref('');
  readonly log = ref<string[]>([]);

  constructor(private readonly speaker: Speaker | null = null, private readonly lang = 'es-ES') {}

  say(text: string, options: SpeakOptions & { urgent?: boolean; interrupt?: boolean } = {}) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    if (options.interrupt) this.speaker?.cancel();
    // Un espacio duro alternado obliga a los lectores de pantalla a releer un texto repetido.
    const region = options.urgent ? this.assertive : this.polite;
    region.value = region.value === clean ? `${clean}\u00a0` : clean;
    this.log.value.push(clean);
    this.speaker?.speak(clean, { lang: this.lang, ...options });
  }

  silence() {
    this.speaker?.cancel();
  }
}
