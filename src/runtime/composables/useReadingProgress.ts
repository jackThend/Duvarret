import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Progreso de lectura estimado (0–100): avanza al ritmo de lectura (palabras por minuto)
 * y salta al 100% si el lector se desplaza al final o pide continuar.
 */
export function useReadingProgress(
  text: Ref<string>,
  report: (percentage: number) => void,
  options: { wpm?: number; tickMs?: number; speed?: Ref<number> } = {},
) {
  const wpm = options.wpm ?? 230;
  const tick = options.tickMs ?? 250;
  let timer: ReturnType<typeof setInterval> | undefined;
  let elapsed = 0;

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  const start = () => {
    stop();
    elapsed = 0;
    const words = text.value.split(/\s+/).filter(Boolean).length;
    const totalMs = Math.max(1500, (words / wpm) * 60000);
    timer = setInterval(() => {
      elapsed += tick * (options.speed?.value ?? 1);
      const pct = Math.min(100, (elapsed / totalMs) * 100);
      report(pct);
      if (pct >= 100) stop();
    }, tick);
  };

  watch(text, start, { immediate: true });
  onBeforeUnmount(stop);

  return {
    complete() {
      stop();
      report(100);
    },
    onScroll(el: HTMLElement) {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 8) this.complete();
    },
  };
}
