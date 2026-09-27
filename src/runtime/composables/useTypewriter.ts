import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';

/** Efecto máquina de escribir configurable (caracteres por segundo). */
export function useTypewriter(text: Ref<string>, cps: Ref<number>, instant: Ref<boolean> = ref(false)) {
  const shown = ref(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  const start = () => {
    stop();
    shown.value = 0;
    if (instant.value || cps.value <= 0) {
      shown.value = text.value.length;
      return;
    }
    const interval = 1000 / cps.value;
    timer = setInterval(() => {
      shown.value = Math.min(text.value.length, shown.value + 1);
      if (shown.value >= text.value.length) stop();
    }, interval);
  };

  watch(text, start, { immediate: true });
  onBeforeUnmount(stop);

  const visible = computed(() => text.value.slice(0, shown.value));
  const done = computed(() => shown.value >= text.value.length);

  function complete() {
    stop();
    shown.value = text.value.length;
  }

  return { visible, done, complete, restart: start };
}
