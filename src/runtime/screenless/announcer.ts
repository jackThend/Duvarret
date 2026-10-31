/**
 * Anuncios accesibles: región ARIA live + síntesis de voz (Web Speech API) cuando existe.
 * Compatible con lectores de pantalla (NVDA, JAWS, VoiceOver).
 */
import { ref } from 'vue';
import type { StoryManifest } from '@/core/manifest';
import { speechKey } from '@/core/narration/script';
import type { SpatialAudioEngine } from '../audio/SpatialAudioEngine';

export interface SpeakOptions {
  pitch?: number;
  rate?: number;
  lang?: string;
}

export interface Speaker {
  speak(text: string, options?: SpeakOptions): void | Promise<void>;
  cancel(): void;
}

export function createSpeechSpeaker(): Speaker | null {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  const Utterance = typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined;
  if (!synth || !Utterance) return null;
  const pending = new Set<() => void>();
  return {
    speak(text, options = {}) {
      const u = new Utterance(text);
      u.lang = options.lang ?? 'es-ES';
      u.pitch = options.pitch ?? 1;
      u.rate = options.rate ?? 1;
      return new Promise<void>((resolve) => {
        const finish = () => { pending.delete(finish); resolve(); };
        pending.add(finish);
        u.onend = u.onerror = finish;
        synth.speak(u);
      });
    },
    cancel: () => { synth.cancel(); for (const finish of pending) finish(); },
  };
}

export class Announcer {
  /** Texto de la región `aria-live="polite"`. */
  readonly polite = ref('');
  /** Texto de la región `aria-live="assertive"` (alertas y resultados). */
  readonly assertive = ref('');
  readonly log = ref<string[]>([]);
  readonly warning = ref('');
  private queue: { text: string; options: SayOptions }[] = [];
  private active: symbol | null = null;
  private muted = false;
  private audio: SpatialAudioEngine | null = null;
  private profile: StoryManifest['global_settings']['narration_voice'];
  private readonly audioId = 'duvarret::speech';

  constructor(private readonly speaker: Speaker | null = null, private readonly lang = 'es-ES') {}

  configure(audio: SpatialAudioEngine | null, profile: StoryManifest['global_settings']['narration_voice']) {
    this.audio = audio;
    this.profile = profile;
    this.warning.value = '';
  }

  discardQueued(group: string) { this.queue = this.queue.filter(entry => entry.options.group !== group); }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.silence();
  }

  say(text: string, options: SayOptions = {}) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) { options.onEnd?.(); return; }
    if (options.interrupt || options.urgent) this.silence();
    // Un espacio duro alternado obliga a los lectores de pantalla a releer un texto repetido.
    const region = options.urgent ? this.assertive : this.polite;
    region.value = region.value === clean ? `${clean}\u00a0` : clean;
    this.log.value.push(clean);
    if (this.muted) { options.onEnd?.(); return; }
    this.queue.push({ text: clean, options });
    this.pump();
  }

  /** Una sola cola para voz grabada y síntesis; solo el evento de fin da paso al siguiente. */
  private pump() {
    if (this.active || !this.queue.length) return;
    const entry = this.queue.shift()!;
    const token = Symbol('turno de voz');
    this.active = token;
    const current = () => this.active === token;
    const finish = () => {
      if (!current()) return;
      this.active = null;
      entry.options.onEnd?.();
      this.pump();
    };
    const fail = () => {
      if (!current()) return;
      this.warning.value = `Actualiza la grabación de «${entry.text.slice(0, 85)}» para escucharla con la voz de la obra.`;
      finish();
    };
    const synthetic = () => {
      if (!current()) return;
      // Nunca cambiar silenciosamente una voz natural elegida por la del navegador.
      if (this.profile) return fail();
      try {
        const result = this.speaker?.speak(entry.text, { lang: this.lang, ...entry.options });
        if (result) void result.then(finish, finish);
        else finish();
      } catch { finish(); }
    };
    const asset = this.profile
      ? this.profile.clips.find(clip => speechKey(clip.text) === speechKey(entry.text))?.asset
      : entry.options.asset;
    if (this.profile && !asset) return fail();
    if (!asset || !this.audio) return synthetic();
    void this.audio.play(asset, { id: this.audioId, label: 'voz de la obra', allowPlaceholder: false, spatial: false, onEnded: finish })
      .then(voice => {
        if (!current()) return;
        if (!voice || voice.placeholder) synthetic();
      }, synthetic);
  }

  silence() {
    this.queue = [];
    this.active = null;
    this.speaker?.cancel();
    this.audio?.stop(this.audioId, 0);
  }
}

interface SayOptions extends SpeakOptions {
  urgent?: boolean;
  interrupt?: boolean;
  asset?: string;
  onEnd?: () => void;
  group?: string;
}
