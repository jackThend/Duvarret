/**
 * Backends de espacialización intercambiables:
 *  - `resonance_3d`: Google Resonance Audio SDK (ambisónicos + salas con materiales).
 *  - `hrtf_native`: PannerNode HRTF + reverberación convolutiva sintetizada (Web Audio nativo).
 *  - `stereo_simple`: degradación elegante a paneo estéreo con atenuación por distancia.
 */
import type { AcousticMaterial, Coordinates, RoomPreset } from '@/core/manifest';
import { distance, toWebAudio } from './coordinates';
import { MATERIAL_MODELS, ROOM_MODELS } from './rooms';
import { synthesizeImpulse } from './impulse';

export type BackendKind = 'resonance_3d' | 'hrtf_native' | 'stereo_simple';

export interface SpatialVoice {
  input: AudioNode;
  setPosition(c: Coordinates): void;
  dispose(): void;
}

export interface SpatialBackend {
  readonly kind: BackendKind;
  createVoice(position: Coordinates): SpatialVoice;
  setRoom(preset: RoomPreset, material: AcousticMaterial): void;
  dispose(): void;
}

export function setParam(param: AudioParam | undefined, value: number, ctx: BaseAudioContext) {
  if (!param) return;
  if (typeof param.setTargetAtTime === 'function') param.setTargetAtTime(value, ctx.currentTime, 0.015);
  else param.value = value;
}

/** Backend HRTF nativo sobre Web Audio API. */
export class HrtfBackend implements SpatialBackend {
  readonly kind: BackendKind = 'hrtf_native';
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly convolver: ConvolverNode;
  private readonly materialFilter: BiquadFilterNode;
  private readonly send: GainNode;

  constructor(private readonly ctx: BaseAudioContext, destination: AudioNode) {
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.send = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.materialFilter = ctx.createBiquadFilter();
    this.materialFilter.type = 'lowpass';
    this.send.connect(this.materialFilter);
    this.materialFilter.connect(this.convolver);
    this.convolver.connect(this.wet);
    this.dry.connect(destination);
    this.wet.connect(destination);
  }

  createVoice(position: Coordinates): SpatialVoice {
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 100;
    panner.rolloffFactor = 1.1;
    panner.connect(this.dry);
    panner.connect(this.send);
    const place = (c: Coordinates) => {
      const [x, y, z] = toWebAudio(c);
      if (panner.positionX) {
        setParam(panner.positionX, x, this.ctx);
        setParam(panner.positionY, y, this.ctx);
        setParam(panner.positionZ, z, this.ctx);
      } else panner.setPosition(x, y, z);
    };
    place(position);
    return { input: panner, setPosition: place, dispose: () => panner.disconnect() };
  }

  setRoom(preset: RoomPreset, material: AcousticMaterial) {
    const room = ROOM_MODELS[preset];
    const mat = MATERIAL_MODELS[material];
    const [left, right] = synthesizeImpulse(room, this.ctx.sampleRate, mat.reflection);
    const buffer = this.ctx.createBuffer(2, left.length, this.ctx.sampleRate);
    buffer.getChannelData(0).set(left);
    buffer.getChannelData(1).set(right);
    this.convolver.buffer = buffer;
    setParam(this.materialFilter.frequency, mat.cutoffHz, this.ctx);
    setParam(this.wet.gain, room.wet, this.ctx);
    setParam(this.dry.gain, 1 - room.wet * 0.4, this.ctx);
  }

  dispose() {
    for (const node of [this.dry, this.wet, this.convolver, this.materialFilter, this.send]) node.disconnect();
  }
}

/** Degradación a paneo estéreo (dispositivos sin HRTF). */
export class StereoBackend implements SpatialBackend {
  readonly kind: BackendKind = 'stereo_simple';
  constructor(private readonly ctx: BaseAudioContext, private readonly destination: AudioNode) {}

  createVoice(position: Coordinates): SpatialVoice {
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    gain.connect(pan);
    pan.connect(this.destination);
    const place = (c: Coordinates) => {
      const d = Math.max(1, distance(c));
      setParam(pan.pan, Math.max(-1, Math.min(1, c.x / d)), this.ctx);
      // Lo que suena detrás se percibe algo más apagado.
      setParam(gain.gain, (1 / d) * (c.z < 0 ? 0.8 : 1), this.ctx);
    };
    place(position);
    return {
      input: gain,
      setPosition: place,
      dispose: () => {
        gain.disconnect();
        pan.disconnect();
      },
    };
  }

  setRoom() {}
  dispose() {}
}

/** Backend Google Resonance Audio (cargado bajo demanda). */
export class ResonanceBackend implements SpatialBackend {
  readonly kind: BackendKind = 'resonance_3d';

  constructor(
    private readonly scene: import('resonance-audio').ResonanceAudio,
    destination: AudioNode,
  ) {
    scene.output.connect(destination);
    scene.setListenerPosition(0, 0, 0);
    scene.setListenerOrientation(0, 0, -1, 0, 1, 0);
  }

  static async create(ctx: BaseAudioContext, destination: AudioNode): Promise<ResonanceBackend> {
    const mod = await import('resonance-audio');
    const Ctor = mod.ResonanceAudio ?? (mod as unknown as { default: typeof mod }).default.ResonanceAudio;
    return new ResonanceBackend(new Ctor(ctx, { ambisonicOrder: 1 }), destination);
  }

  createVoice(position: Coordinates): SpatialVoice {
    const source = this.scene.createSource();
    const place = (c: Coordinates) => source.setPosition(...toWebAudio(c));
    place(position);
    return { input: source.input, setPosition: place, dispose: () => source.input.disconnect() };
  }

  setRoom(preset: RoomPreset, material: AcousticMaterial) {
    const room = ROOM_MODELS[preset];
    const wall = MATERIAL_MODELS[material].resonance;
    const open = preset === 'outdoor_field' ? 'transparent' : wall;
    this.scene.setRoomProperties(room.dimensions, {
      left: open,
      right: open,
      front: open,
      back: open,
      down: preset === 'outdoor_field' ? 'grass' : wall,
      up: open,
    });
  }

  dispose() {
    this.scene.output.disconnect();
  }
}
