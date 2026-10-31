import { onBeforeUnmount, onMounted, watch } from 'vue';
import { isTauri } from '@/core/lore/tauriDriver';
import type { ProjectStore } from '../stores/project';

/** Guarda tras una pausa; un fallo queda visible y no genera un bucle de reintentos. */
export function useAutosave(project: ProjectStore) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unlisten: (() => void) | undefined;
  let disposed = false;
  const stop = watch([() => project.changedAt, () => project.dirty, () => project.meta.mode], () => {
    clearTimeout(timer);
    if (project.dirty) timer = setTimeout(() => { void project.save().catch(() => undefined); }, 1200);
  });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!project.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  };
  onMounted(async () => {
    window.addEventListener('beforeunload', beforeUnload);
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      if (disposed) return;
      const window = getCurrentWindow();
      unlisten = await window.onCloseRequested(async event => {
        if (!project.dirty && !project.savingCount) return;
        event.preventDefault();
        try { await project.save(); if (!project.dirty) await window.destroy(); } catch { /* El aviso de guardado permanece visible. */ }
      });
      if (disposed) unlisten();
    }
  });
  onBeforeUnmount(() => { disposed = true; stop(); clearTimeout(timer); unlisten?.(); window.removeEventListener('beforeunload', beforeUnload); });
}
