/**
 * Motor de audio espacial y psicoacústica 3D del Duvarret Runtime (doc 02 §5.2, RF-11/12).
 *
 * Cadena por evento: Fuente → Ganancia (fundido) → Voz espacial (backend) → Máster → Salida.
 * Si un asset falta, se reproduce un tono de prueba en la misma posición sin detener la lectura.
 */
import type {
  AcousticEvent,
  AcousticMaterial,
  AudioEngineKind,
  Coordinates,
  RoomPreset,
  StoryManifest,
  StoryNode,
} from '@/core/manifest';
import type { RuntimeEvent } from '../stores/story';
import { HrtfBackend, ResonanceBackend, StereoBackend, setParam, type BackendKind, type SpatialBackend } from './backends';
import { sanitizeCoordinates } from './coordinates';

export type AssetLoader = (path: string) => Promise<ArrayBuffer | null>;

export interface AudioEngineOptions {
  preferred?: AudioEngineKind;
  contextFactory?: () => BaseAudioContext;
  loadAsset?: AssetLoader;
  resonanceFactory?: (ctx: BaseAudioContext, destination: AudioNode) => Promise<SpatialBackend>;
  onWarning?: (message: string) => void;
}

export interface PlayOptions {
  id?: string;
  loop?: boolean;
  gain?: number;
  coordinates?: Partial<Coordinates>;
  fadeInMs?: number;
  label?: string;
}

export interface ActiveVoice {
  id: string;
  asset: string;
  label: string;
  coordinates: Coordinates;
  loop: boolean;
  placeholder: boolean;
}

interface VoiceHandle extends ActiveVoice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  voice: ReturnType<SpatialBackend['createVoice']>;
}

/** Cargador por defecto: `fetch` relativo (funciona en Web/PWA y dentro de Tauri). */
export const fetchAssetLoader: AssetLoader = async (path) => {
  try {
    const response = await fetch(path);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
};

function defaultContext(): BaseAudioContext {
  const Ctor =
    globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('Este dispositivo no ofrece sonido espacial.');
  return new Ctor({ latencyHint: 'interactive' });
}

export class SpatialAudioEngine {
  ctx: BaseAudioContext | null = null;
  backend: SpatialBackend | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly voices = new Map<string, VoiceHandle>();
  private readonly listeners = new Set<(voices: ActiveVoice[]) => void>();
  private initPromise: Promise<void> | null = null;
  private room: { preset: RoomPreset; material: AcousticMaterial } | null = null;
  private counter = 0;

  constructor(private readonly options: AudioEngineOptions = {}) {}

  get backendKind(): BackendKind | null {
    return this.backend?.kind ?? null;
  }

  /** Inicializa el contexto (idealmente tras un gesto del usuario, por política de autoplay). */
  init(): Promise<void> {
    this.initPromise ??= this.doInit();
    return this.initPromise;
  }

  private async doInit() {
    const ctx = (this.options.contextFactory ?? defaultContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const preferred = this.options.preferred ?? 'resonance_3d';
    const supportsHrtf = typeof ctx.createPanner === 'function';

    if (preferred === 'stereo_simple' || !supportsHrtf) {
      this.backend = new StereoBackend(ctx, this.master);
    } else if (preferred === 'resonance_3d') {
      try {
        const factory = this.options.resonanceFactory ?? ((c, d) => ResonanceBackend.create(c, d));
        this.backend = await factory(ctx, this.master);
      } catch {
        this.warn('El motor de salas envolventes no está disponible; se usa la escucha binaural estándar.');
        this.backend = new HrtfBackend(ctx, this.master);
      }
    } else {
      // steam_audio_wasm: el trazado de rayos se aproxima con convolución de sala + HRTF.
      this.backend = new HrtfBackend(ctx, this.master);
    }
    if (this.room) this.backend.setRoom(this.room.preset, this.room.material);
  }

  async resume() {
    await this.init();
    const ctx = this.ctx as AudioContext | null;
    if (ctx && 'resume' in ctx && ctx.state === 'suspended') await ctx.resume();
  }

  private warn(message: string) {
    this.options.onWarning?.(message);
  }

  setRoom(preset: RoomPreset, material: AcousticMaterial) {
    if (this.room?.preset === preset && this.room.material === material) return;
    this.room = { preset, material };
    this.backend?.setRoom(preset, material);
  }

  get currentRoom() {
    return this.room;
  }

  setMasterGain(value: number) {
    if (this.master && this.ctx) setParam(this.master.gain, Math.max(0, Math.min(1, value)), this.ctx);
  }

  private loadBuffer(path: string): Promise<AudioBuffer | null> {
    if (!path) return Promise.resolve(null);
    let pending = this.buffers.get(path);
    if (!pending) {
      pending = (async () => {
        const loader = this.options.loadAsset ?? fetchAssetLoader;
        const data = await loader(path).catch(() => null);
        if (!data || !this.ctx) return null;
        try {
          return await this.ctx.decodeAudioData(data.slice(0));
        } catch {
          return null;
        }
      })();
      this.buffers.set(path, pending);
    }
    return pending;
  }

  /** Precarga para disparos de baja latencia (< 20 ms tras el evento). */
  async preload(paths: string[]) {
    await this.init();
    await Promise.all([...new Set(paths.filter(Boolean))].map((p) => this.loadBuffer(p)));
  }

  async play(asset: string, options: PlayOptions = {}): Promise<ActiveVoice | null> {
    await this.init();
    const ctx = this.ctx!;
    const id = options.id ?? `voz_${++this.counter}`;
    this.stop(id, 0);
    const coordinates = sanitizeCoordinates(options.coordinates);
    const buffer = await this.loadBuffer(asset);

    const voice = this.backend!.createVoice(coordinates);
    const gain = ctx.createGain();
    gain.connect(voice.input);
    const target = Math.max(0, Math.min(1, options.gain ?? 1));

    let source: AudioScheduledSourceNode;
    let placeholder = false;
    let loop = !!options.loop;
    if (buffer) {
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = loop;
      source = node;
    } else {
      // Tono de prueba: el sonido no se encontró, pero la escena continúa.
      placeholder = true;
      loop = false;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;
      source = osc;
      this.warn(`No se encontró el sonido «${asset || 'sin nombre'}»; se reproduce un tono de prueba.`);
    }
    source.connect(gain);

    const now = ctx.currentTime;
    const fade = (options.fadeInMs ?? 0) / 1000;
    gain.gain.setValueAtTime(fade > 0 ? 0 : placeholder ? target * 0.15 : target, now);
    if (fade > 0) gain.gain.linearRampToValueAtTime(placeholder ? target * 0.15 : target, now + fade);
    source.start(now);
    if (placeholder) source.stop(now + 0.25);

    const handle: VoiceHandle = {
      id,
      asset,
      label: options.label ?? id,
      coordinates,
      loop,
      placeholder,
      source,
      gain,
      voice,
    };
    source.onended = () => {
      if (this.voices.get(id) === handle) this.release(handle);
    };
    this.voices.set(id, handle);
    this.notify();
    return this.describe(handle);
  }

  private describe(h: VoiceHandle): ActiveVoice {
    return { id: h.id, asset: h.asset, label: h.label, coordinates: { ...h.coordinates }, loop: h.loop, placeholder: h.placeholder };
  }

  private release(handle: VoiceHandle) {
    this.voices.delete(handle.id);
    handle.gain.disconnect();
    handle.voice.dispose();
    this.notify();
  }

  stop(id: string, fadeMs = 400) {
    const handle = this.voices.get(id);
    if (!handle || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.voices.delete(id);
    if (fadeMs > 0) {
      handle.gain.gain.setTargetAtTime(0, now, fadeMs / 3000);
      try {
        handle.source.stop(now + fadeMs / 1000);
      } catch {
        /* ya detenida */
      }
      handle.source.onended = () => {
        handle.gain.disconnect();
        handle.voice.dispose();
      };
    } else {
      try {
        handle.source.stop();
      } catch {
        /* ya detenida */
      }
      handle.gain.disconnect();
      handle.voice.dispose();
    }
    this.notify();
  }

  stopAll(options: { fadeMs?: number; loopsOnly?: boolean } = {}) {
    for (const handle of [...this.voices.values()]) {
      if (options.loopsOnly && !handle.loop) continue;
      this.stop(handle.id, options.fadeMs ?? 400);
    }
  }

  /** Reposiciona en vivo una fuente (radar arrastrable). */
  move(id: string, coordinates: Partial<Coordinates>) {
    const handle = this.voices.get(id);
    if (!handle) return;
    handle.coordinates = sanitizeCoordinates(coordinates);
    handle.voice.setPosition(handle.coordinates);
    this.notify();
  }

  get active(): ActiveVoice[] {
    return [...this.voices.values()].map((h) => this.describe(h));
  }

  subscribe(listener: (voices: ActiveVoice[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.active);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const snapshot = this.active;
    for (const l of this.listeners) l(snapshot);
  }

  /** Reproduce un evento acústico declarado en el manifiesto. */
  playEvent(event: AcousticEvent, nodeId: string) {
    return this.play(event.asset, {
      id: `${nodeId}::${event.event_id}`,
      loop: event.loop,
      gain: event.gain,
      coordinates: event.coordinates,
      fadeInMs: event.fade_in_ms,
      label: event.label ?? event.event_id,
    });
  }

  /** "Pop" espacial breve que confirma la ubicación de una fuente (microinteracción del Studio). */
  async confirmationPop(coordinates: Partial<Coordinates>) {
    await this.init();
    const ctx = this.ctx!;
    const voice = this.backend!.createVoice(sanitizeCoordinates(coordinates));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(voice.input);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
    osc.onended = () => voice.dispose();
  }

  /**
   * Conecta el motor a la máquina de estados: cada evento narrativo dispara los sonidos
   * declarados. Devuelve la función de desconexión.
   */
  bind(store: { on(listener: (e: RuntimeEvent) => void): () => void; currentNode: StoryNode | null; manifest: StoryManifest | null }) {
    return store.on((event) => {
      const node = store.currentNode;
      const env = store.manifest?.acoustic_environment;
      if (event.type === 'node_exit') {
        this.stopAll({ loopsOnly: true, fadeMs: 700 });
        return;
      }
      if (event.type === 'play_sfx') {
        if (event.asset) void this.play(event.asset, { gain: 0.9 });
        return;
      }
      if (!node || node.node_id !== event.nodeId) return;
      if (event.type === 'on_node_enter') {
        const first = node.acoustic_events[0];
        this.setRoom(
          first?.room_preset ?? env?.default_room_preset ?? 'small_study',
          first?.acoustic_material ?? env?.default_material ?? 'wood',
        );
        if (env) this.setMasterGain(env.master_gain);
        void this.preload(node.acoustic_events.map((e) => e.asset));
      }
      for (const acoustic of node.acoustic_events) {
        if (acoustic.trigger !== event.type) continue;
        if (event.type === 'on_text_reveal_percentage' && (acoustic.trigger_value ?? 50) !== event.value) continue;
        void this.playEvent(acoustic, node.node_id);
      }
    });
  }

  async dispose() {
    this.stopAll({ fadeMs: 0 });
    this.backend?.dispose();
    this.master?.disconnect();
    const ctx = this.ctx as AudioContext | null;
    if (ctx && 'close' in ctx) await ctx.close().catch(() => undefined);
    this.ctx = null;
    this.backend = null;
    this.initPromise = null;
    this.buffers.clear();
  }
}
