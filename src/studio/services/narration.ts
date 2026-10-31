import type { NarrationPlan } from '@/core/narration/plan';

export interface NarrationProgress { completed: number; total: number }
export interface GeneratedClip { text: string; asset: string; bytes: number }
export interface NarrationStatus { ready: boolean; message: string }

/** Comprueba el paquete incluido sin cargar el modelo ni consultar la red. */
export async function narrationStatus(): Promise<NarrationStatus> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<NarrationStatus>('narration_status');
}

export async function availableNarrationAssets(root: string): Promise<Set<string>> {
  const { invoke } = await import('@tauri-apps/api/core');
  return new Set(await invoke<string[]>('project_list_assets', { root }));
}

/** Solo el shell de escritorio ejecuta el modelo local; no se envía texto a servicios externos. */
export async function synthesizeNarration(root: string, plan: NarrationPlan, progress: (value: NarrationProgress) => void): Promise<GeneratedClip[]> {
  const { invoke, Channel } = await import('@tauri-apps/api/core');
  const onProgress = new Channel<NarrationProgress>();
  onProgress.onmessage = progress;
  return invoke<GeneratedClip[]>('narration_generate', {
    root, voice: plan.voice, delivery: plan.delivery, speed: plan.speed, clips: plan.pending, onProgress,
  });
}
