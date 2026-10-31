/**
 * Bucle auditivo del Modo Sin Pantalla (RF-10, RNF-07): cada escena se narra por voz y foley 3D,
 * y las decisiones se toman con el teclado numérico, atajos universales o comandos de voz.
 */
import type { StoryNode } from '@/core/manifest';
import type { StoryStore } from '../stores/story';
import type { SpatialAudioEngine } from '../audio/SpatialAudioEngine';
import type { Announcer } from './announcer';
import { HELP_TEXT, END_TEXT, CONTINUE_TEXT, NOT_UNDERSTOOD, introductionText, optionText } from '@/core/narration/script';
export { HELP_TEXT } from '@/core/narration/script';

export interface ScreenlessOption {
  key: string;
  label: string;
  target?: string;
  choiceIndex?: number;
  action?: 'advance' | 'attempt_puzzle' | 'abandon_puzzle';
}

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
    this.announcer.configure(this.audio, this.store.manifest?.global_settings.narration_voice);
    this.unbind = this.store.on((event) => {
      if (event.type === 'on_node_enter') this.enterNode();
      if (event.type === 'node_exit') {
        this.silence();
        this.audio?.stop(`${event.nodeId}::foley`, 900);
        this.audio?.stop(`${event.nodeId}::voz`, 300);
      }
    });
    if (this.store.currentNode) this.enterNode();
    else this.announcer.say(HELP_TEXT);
  }

  stop() {
    this.unbind?.();
    this.unbind = null;
    this.silence();
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
    this.silence();
    this.announcer.configure(this.audio, this.store.manifest?.global_settings.narration_voice);
    this.codeBuffer = '';
    this.attempts = 0;
    const sl = node.screenless_mode;
    if (sl?.foley_bed) void this.audio?.play(sl.foley_bed, { id: `${node.node_id}::foley`, loop: true, gain: 0.5, fadeInMs: 800 });
    if (node.title) this.announcer.say(node.title);
    this.store.setRevealProgress(100);
    // Las teclas funcionan desde el primer momento, aunque el menú se anuncie al final.
    this.options = this.buildOptions();
    // Con narración grabada, el resto (diálogos, hallazgos y menú) espera a que termine la voz.
    this.narrate(() => this.announceRest());
  }

  private announceRest() {
    const vn = this.node?.visual_novel_overlay;
    if (vn?.enabled) {
      const lines = vn.lines.length ? vn.lines : [{ speaker: vn.active_speaker, text: vn.dialogue_text }];
      for (const line of lines) {
        if (!line.text) continue;
        const name = this.store.manifest?.character_registry[line.speaker]?.name ?? line.speaker;
        this.announcer.say(`${name}: ${line.text}`, this.voiceFor(line.speaker));
      }
    }
    for (const extra of this.store.revealedExtraTexts) this.announcer.say(extra);
    this.announceOptions();
  }

  /**
   * Encola la escena después de su título. `then` espera el final real de la intervención.
   * La voz de la obra tiene prioridad; las obras antiguas conservan grabación o síntesis.
   * Si la voz se cancela o cambia la escena, los callbacks anteriores ya no cuentan.
   */
  narrate(then?: () => void) {
    const node = this.node;
    if (!node) return;
    this.announcer.say(node.screenless_mode?.narration_text ?? node.text_payload, {
      asset: node.screenless_mode?.voice_over_asset,
      onEnd: then,
    });
  }

  /** Detiene la voz (sintética y grabada) sin tocar el fondo sonoro. */
  silence() {
    this.announcer.silence();
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
      // Si el destino es el de una elección de la escena, se respetan sus condiciones y se elige
      // a través de ella (para conceder sus marcas), igual que en pantalla.
      const choices = node.navigation.choices;
      const available = this.store.availableChoices;
      const viaChoice = (target: string): Pick<ScreenlessOption, 'choiceIndex'> | null => {
        if (!choices.some((c) => c.target_node === target)) return {};
        const entry = available.find(({ choice }) => choice.target_node === target);
        return entry ? { choiceIndex: entry.index } : null;
      };
      const byTarget = new Map(prompt.voice_options.map((o) => [o.target_node, o.phrase]));
      const add = (key: string, label: string, target: string) => {
        const choice = viaChoice(target);
        if (choice) options.push({ key, label: choices.find(c => c.target_node === target)?.choice_text ?? label, target, ...choice });
      };
      for (const [key, target] of Object.entries(prompt.keypad_shortcuts)) add(key, byTarget.get(target) ?? target, target);
      if (!Object.keys(prompt.keypad_shortcuts).length) prompt.voice_options.forEach((o, i) => add(String(i + 1), o.phrase, o.target_node));
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
    this.announcer.discardQueued('options');
    this.options = this.buildOptions();
    const parts: string[] = [];
    const prompt = node.screenless_mode?.voice_prompts[0];
    const overlay = node.gameplay_overlay;
    if (this.store.puzzlePending && overlay) {
      parts.push(overlay.title || 'Un enigma bloquea el camino.');
      if (typeof overlay.parameters.prompt_text === 'string') parts.push(overlay.parameters.prompt_text);
      if (typeof overlay.parameters.target_code === 'string') parts.push('Teclea el código con los números y pulsa Intro.');
    } else if (introductionText(prompt?.spoken_prompt)) parts.push(introductionText(prompt?.spoken_prompt));
    for (const option of this.options) parts.push(optionText(option.key, option.label));
    if (this.store.canAdvance && !this.options.length) parts.push(CONTINUE_TEXT);
    if (this.store.isEnding) parts.push(END_TEXT);
    for (const part of parts) this.announcer.say(part, { group: 'options' });
  }

  private select(option: ScreenlessOption) {
    const before = this.store.currentNodeId;
    if (option.action === 'attempt_puzzle') this.store.resolvePuzzle(true);
    else if (option.action === 'abandon_puzzle') this.store.resolvePuzzle(false);
    else if (option.choiceIndex !== undefined) this.store.choose(option.choiceIndex);
    else if (option.target) this.store.goTo(option.target);
    if (this.store.currentNodeId === before) this.announceOptions();
  }

  submitCodeText(text: string) {
    this.codeBuffer = text;
    this.submitCode();
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
      const numeric = /^\d+$/.test(String(node?.gameplay_overlay?.parameters.target_code));
      if ((numeric ? /^\d$/ : /^[0-9a-zA-Z]$/).test(key) && !['r', 'o', 'i', 's', 'h'].includes(key.toLowerCase())) {
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
        this.enterNode();
        return true;
      case 'o':
        this.announceOptions();
        return true;
      case 'i':
        this.announceInventory();
        return true;
      case 's':
        this.silence();
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
    if (!names.length) this.announcer.say('No llevas nada.');
    else {
      this.announcer.say('Llevas:');
      for (const name of names) this.announcer.say(name);
    }
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
    this.announcer.say(NOT_UNDERSTOOD);
    return false;
  }
}
