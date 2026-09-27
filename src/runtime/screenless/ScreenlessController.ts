/**
 * Bucle auditivo del Modo Sin Pantalla (RF-10, RNF-07): cada escena se narra por voz y foley 3D,
 * y las decisiones se toman con el teclado numérico, atajos universales o comandos de voz.
 */
import type { StoryNode } from '@/core/manifest';
import type { StoryStore } from '../stores/story';
import type { SpatialAudioEngine } from '../audio/SpatialAudioEngine';
import type { Announcer } from './announcer';

export interface ScreenlessOption {
  key: string;
  label: string;
  target?: string;
  choiceIndex?: number;
  action?: 'advance' | 'attempt_puzzle' | 'abandon_puzzle';
}

export const HELP_TEXT =
  'Atajos: números para elegir, Espacio o Intro para continuar, R para repetir, O para oír las opciones, ' +
  'I para el inventario, S para silenciar la voz, H para esta ayuda.';

export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class ScreenlessController {
  private unbind: (() => void) | null = null;
  private codeBuffer = '';
  private attempts = 0;
  options: ScreenlessOption[] = [];

  constructor(
    private readonly store: StoryStore,
    private readonly announcer: Announcer,
    private readonly audio: SpatialAudioEngine | null = null,
  ) {}

  start() {
    this.unbind = this.store.on((event) => {
      if (event.type === 'on_node_enter') this.enterNode();
      if (event.type === 'node_exit') this.audio?.stop(`${event.nodeId}::foley`, 900);
    });
    if (this.store.currentNode) this.enterNode();
    else this.announcer.say(`Modo sin pantalla activado. ${HELP_TEXT}`);
  }

  stop() {
    this.unbind?.();
    this.unbind = null;
    this.announcer.silence();
  }

  private get node(): StoryNode | null {
    return this.store.currentNode;
  }

  private voiceFor(speaker?: string) {
    const profile = speaker ? this.store.manifest?.character_registry[speaker]?.voice_profile : undefined;
    return profile ? { pitch: profile.tts_pitch, rate: profile.tts_speed } : {};
  }

  private enterNode() {
    const node = this.node;
    if (!node) return;
    this.codeBuffer = '';
    this.attempts = 0;
    const sl = node.screenless_mode;
    if (sl?.foley_bed) void this.audio?.play(sl.foley_bed, { id: `${node.node_id}::foley`, loop: true, gain: 0.5, fadeInMs: 800 });

    if (node.title) this.announcer.say(node.title, { interrupt: true });
    if (sl?.voice_over_asset) void this.audio?.play(sl.voice_over_asset, { id: `${node.node_id}::voz` });
    else this.narrate();

    const vn = node.visual_novel_overlay;
    if (vn?.enabled) {
      const lines = vn.lines.length ? vn.lines : [{ speaker: vn.active_speaker, text: vn.dialogue_text }];
      for (const line of lines) {
        if (!line.text) continue;
        const name = this.store.manifest?.character_registry[line.speaker]?.name ?? line.speaker;
        this.announcer.say(`${name}: ${line.text}`, this.voiceFor(line.speaker));
      }
    }
    for (const extra of this.store.revealedExtraTexts) this.announcer.say(extra);
    this.store.setRevealProgress(100);
    this.announceOptions();
  }

  narrate() {
    const node = this.node;
    if (!node) return;
    this.announcer.say(node.screenless_mode?.narration_text ?? node.text_payload);
  }

  /** Construye el menú audible de la escena actual. */
  buildOptions(): ScreenlessOption[] {
    const node = this.node;
    if (!node) return [];
    const options: ScreenlessOption[] = [];
    const prompt = node.screenless_mode?.voice_prompts[0];

    if (this.store.puzzlePending && node.gameplay_overlay) {
      if (typeof node.gameplay_overlay.parameters.target_code !== 'string') {
        options.push({ key: '1', label: 'intentar resolver el enigma', action: 'attempt_puzzle' });
        options.push({ key: '2', label: 'abandonar el enigma', action: 'abandon_puzzle' });
      }
      return options;
    }

    if (prompt) {
      const byTarget = new Map(prompt.voice_options.map((o) => [o.target_node, o.phrase]));
      for (const [key, target] of Object.entries(prompt.keypad_shortcuts)) {
        options.push({ key, label: byTarget.get(target) ?? target, target });
      }
      if (!options.length) prompt.voice_options.forEach((o, i) => options.push({ key: String(i + 1), label: o.phrase, target: o.target_node }));
    } else {
      this.store.availableChoices.forEach(({ choice, index }, i) =>
        options.push({ key: String(i + 1), label: choice.choice_text, target: choice.target_node, choiceIndex: index }),
      );
    }
    return options;
  }

  announceOptions() {
    const node = this.node;
    if (!node) return;
    this.options = this.buildOptions();
    const parts: string[] = [];
    const prompt = node.screenless_mode?.voice_prompts[0];
    const overlay = node.gameplay_overlay;
    if (this.store.puzzlePending && overlay) {
      parts.push(overlay.title || 'Un enigma bloquea el camino.');
      if (typeof overlay.parameters.prompt_text === 'string') parts.push(overlay.parameters.prompt_text);
      if (typeof overlay.parameters.target_code === 'string') parts.push('Teclea el código con los números y pulsa Intro.');
    } else if (prompt?.spoken_prompt) parts.push(prompt.spoken_prompt);
    for (const option of this.options) parts.push(`${option.key}: ${option.label}.`);
    if (this.store.canAdvance && !this.options.length) parts.push('Pulsa Espacio para continuar.');
    if (this.store.isEnding) parts.push('Fin de la obra. Pulsa R para volver a escuchar.');
    if (parts.length) this.announcer.say(parts.join(' '));
  }

  private select(option: ScreenlessOption) {
    const before = this.store.currentNodeId;
    if (option.action === 'attempt_puzzle') this.store.resolvePuzzle(true);
    else if (option.action === 'abandon_puzzle') this.store.resolvePuzzle(false);
    else if (option.choiceIndex !== undefined) this.store.choose(option.choiceIndex);
    else if (option.target) this.store.goTo(option.target);
    if (this.store.currentNodeId === before) this.announceOptions();
  }

  private submitCode() {
    const overlay = this.node?.gameplay_overlay;
    const target = overlay?.parameters.target_code;
    if (!overlay || typeof target !== 'string') return;
    const maxAttempts = typeof overlay.parameters.max_attempts === 'number' ? overlay.parameters.max_attempts : 3;
    const code = this.codeBuffer;
    this.codeBuffer = '';
    const before = this.store.currentNodeId;
    if (code === target) {
      this.announcer.say('Código correcto.', { urgent: true });
      this.store.resolvePuzzle(true);
      if (this.store.currentNodeId === before) this.announceOptions();
      return;
    }
    this.attempts++;
    if (this.attempts >= maxAttempts) {
      this.announcer.say('Código incorrecto. No quedan intentos.', { urgent: true });
      this.store.resolvePuzzle(false);
      if (this.store.currentNodeId === before) this.announceOptions();
    } else {
      this.announcer.say(`Código incorrecto. Quedan ${maxAttempts - this.attempts} intentos.`, { urgent: true });
    }
  }

  /** Atajos de teclado universales. Devuelve `true` si la tecla fue atendida. */
  handleKey(key: string): boolean {
    const node = this.node;
    const codeEntry = this.store.puzzlePending && typeof node?.gameplay_overlay?.parameters.target_code === 'string';
    if (codeEntry) {
      if (/^[0-9a-zA-Z]$/.test(key) && key.length === 1 && !['r', 'o', 'i', 's', 'h'].includes(key.toLowerCase())) {
        this.codeBuffer += key;
        this.announcer.say(key);
        return true;
      }
      if (key === 'Backspace') {
        this.codeBuffer = this.codeBuffer.slice(0, -1);
        this.announcer.say('borrado');
        return true;
      }
      if (key === 'Enter') {
        this.submitCode();
        return true;
      }
    }

    const option = this.options.find((o) => o.key === key);
    if (option) {
      this.select(option);
      return true;
    }
    switch (key.toLowerCase()) {
      case ' ':
      case 'enter':
        if (this.store.canAdvance) this.store.advance();
        else this.announceOptions();
        return true;
      case 'r':
        this.narrate();
        return true;
      case 'o':
        this.announceOptions();
        return true;
      case 'i':
        this.announceInventory();
        return true;
      case 's':
        this.announcer.silence();
        return true;
      case 'h':
      case '?':
        this.announcer.say(HELP_TEXT);
        return true;
      default:
        return false;
    }
  }

  announceInventory() {
    const registry = this.store.manifest?.item_registry ?? {};
    const names = this.store.inventory.map((id) => registry[id]?.name ?? id);
    this.announcer.say(names.length ? `Llevas: ${names.join(', ')}.` : 'No llevas nada.');
  }

  /** Comandos de voz en lenguaje natural («hackear consola»). */
  handleVoice(transcript: string): boolean {
    const heard = normalizePhrase(transcript);
    if (!heard) return false;
    if (/^(continuar|seguir|siguiente|adelante)$/.test(heard)) return this.handleKey(' ');
    if (/^(repetir|otra vez)$/.test(heard)) return this.handleKey('r');
    if (/^(opciones|que puedo hacer)$/.test(heard)) return this.handleKey('o');
    if (/^inventario$/.test(heard)) return this.handleKey('i');
    const option = this.options.find((o) => {
      const label = normalizePhrase(o.label);
      return heard.includes(label) || label.includes(heard);
    });
    if (option) {
      this.select(option);
      return true;
    }
    this.announcer.say('No entendí. Di «opciones» para escucharlas.');
    return false;
  }
}
