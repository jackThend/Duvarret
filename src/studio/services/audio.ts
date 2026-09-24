import type { InjectionKey } from 'vue';
import type { SpatialAudioEngine } from '@/runtime/audio/SpatialAudioEngine';

/** Motor de audio compartido entre la vista previa y el radar del Studio. */
export const STUDIO_AUDIO: InjectionKey<SpatialAudioEngine | null> = Symbol('duvarret-studio-audio');
