/** Declaraciones mínimas del Google Resonance Audio SDK (Apache-2.0). */
declare module 'resonance-audio' {
  export interface ResonanceSource {
    input: AudioNode;
    setPosition(x: number, y: number, z: number): void;
    setGain?(gain: number): void;
    setSourceWidth?(width: number): void;
  }
  export interface RoomDimensions {
    width: number;
    height: number;
    depth: number;
  }
  export type RoomMaterials = Record<'left' | 'right' | 'front' | 'back' | 'down' | 'up', string>;
  export class ResonanceAudio {
    constructor(context: BaseAudioContext, options?: { ambisonicOrder?: number });
    output: AudioNode;
    createSource(options?: Record<string, unknown>): ResonanceSource;
    setRoomProperties(dimensions: RoomDimensions, materials: RoomMaterials): void;
    setListenerPosition(x: number, y: number, z: number): void;
    setListenerOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
  }
}
