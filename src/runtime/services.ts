import { inject, type InjectionKey } from 'vue';
import type { SpatialAudioEngine } from './audio/SpatialAudioEngine';
import { Announcer } from './screenless/announcer';

/** Servicios del runtime compartidos entre componentes (inyección de dependencias). */
export interface RuntimeServices {
  audio: SpatialAudioEngine | null;
  announcer: Announcer;
  /** Resuelve rutas de assets relativas al proyecto (imágenes, audio). */
  resolveAsset: (path: string) => string;
}

export const RUNTIME_SERVICES: InjectionKey<RuntimeServices> = Symbol('duvarret-runtime');

export function useRuntimeServices(): RuntimeServices {
  return inject(RUNTIME_SERVICES, () => ({ audio: null, announcer: new Announcer(), resolveAsset: (p: string) => p }), true);
}
