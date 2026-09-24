import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/** Reloj de animación basado en requestAnimationFrame (se detiene al desmontar). */
export function useAnimationClock(active: Ref<boolean> = ref(true)) {
  const time = ref(0);
  let frame = 0;
  let origin = 0;

  const tick = (now: number) => {
    if (!origin) origin = now;
    if (active.value) time.value = now - origin;
    frame = requestAnimationFrame(tick);
  };

  onMounted(() => {
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);
  });
  onBeforeUnmount(() => {
    if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  });

  return { time };
}

/** Respeta la preferencia del sistema de reducir el movimiento (accesibilidad). */
export function usePrefersReducedMotion() {
  const reduced = ref(false);
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.value = query.matches;
    const update = (e: MediaQueryListEvent) => (reduced.value = e.matches);
    onMounted(() => query.addEventListener?.('change', update));
    onBeforeUnmount(() => query.removeEventListener?.('change', update));
  }
  return reduced;
}
