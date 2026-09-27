import type { AcousticMaterial, RoomPreset } from '@/core/manifest';

export interface RoomModel {
  /** Tiempo de reverberación (s). */
  rt60: number;
  /** Mezcla de reverberación (0–1). */
  wet: number;
  preDelayMs: number;
  /** Amortiguación de agudos en la cola (0 = brillante, 1 = apagada). */
  damping: number;
  dimensions: { width: number; height: number; depth: number };
}

export const ROOM_MODELS: Record<RoomPreset, RoomModel> = {
  small_study: { rt60: 0.45, wet: 0.18, preDelayMs: 4, damping: 0.55, dimensions: { width: 4, height: 2.8, depth: 5 } },
  narrow_concrete_corridor: { rt60: 1.6, wet: 0.38, preDelayMs: 9, damping: 0.25, dimensions: { width: 1.6, height: 2.6, depth: 24 } },
  wooden_cabin: { rt60: 0.7, wet: 0.22, preDelayMs: 6, damping: 0.6, dimensions: { width: 6, height: 3, depth: 7 } },
  cathedral_echo: { rt60: 4.8, wet: 0.55, preDelayMs: 38, damping: 0.3, dimensions: { width: 30, height: 28, depth: 70 } },
  outdoor_field: { rt60: 0.25, wet: 0.06, preDelayMs: 60, damping: 0.8, dimensions: { width: 100, height: 100, depth: 100 } },
};

export interface MaterialModel {
  /** Frecuencia de corte del filtro paso-bajo aplicado a las reflexiones (Hz). */
  cutoffHz: number;
  /** Ganancia de reflexión relativa (absorción inversa). */
  reflection: number;
  /** Material equivalente en Resonance Audio. */
  resonance: string;
}

export const MATERIAL_MODELS: Record<AcousticMaterial, MaterialModel> = {
  wood: { cutoffHz: 7000, reflection: 0.75, resonance: 'wood-panel' },
  concrete: { cutoffHz: 12000, reflection: 0.95, resonance: 'concrete-block-coarse' },
  metal: { cutoffHz: 16000, reflection: 1, resonance: 'metal' },
  curtains: { cutoffHz: 2500, reflection: 0.35, resonance: 'curtain-heavy' },
  glass: { cutoffHz: 14000, reflection: 0.9, resonance: 'glass-thin' },
  stone: { cutoffHz: 10000, reflection: 0.92, resonance: 'marble' },
};
