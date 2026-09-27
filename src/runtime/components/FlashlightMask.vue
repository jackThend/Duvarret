<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(defineProps<{ radiusPx?: number; darknessOpacity?: number }>(), {
  radiusPx: 180,
  darknessOpacity: 0.92,
});

const x = ref(50);
const y = ref(20);
const unit = ref<'%' | 'px'>('%');
const root = ref<HTMLElement | null>(null);

function moveTo(clientX: number, clientY: number) {
  const rect = root.value?.getBoundingClientRect();
  if (!rect) return;
  unit.value = 'px';
  x.value = clientX - rect.left;
  y.value = clientY - rect.top;
}

function onPointer(event: PointerEvent | MouseEvent) {
  moveTo(event.clientX, event.clientY);
}

function onTouch(event: TouchEvent) {
  const touch = event.touches[0];
  if (touch) moveTo(touch.clientX, touch.clientY);
}

/** Accesible por teclado: las flechas desplazan la luz. */
function onKey(event: KeyboardEvent) {
  const step = unit.value === '%' ? 5 : 40;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  x.value = Math.max(0, x.value + move[0]);
  y.value = Math.max(0, y.value + move[1]);
}

const maskStyle = computed(() => {
  const r = props.radiusPx;
  const pos = `${x.value}${unit.value} ${y.value}${unit.value}`;
  const dark = `rgba(0, 0, 0, ${props.darknessOpacity})`;
  return {
    background: `radial-gradient(circle ${r}px at ${pos}, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${Math.round(r * 0.55)}px, ${dark} ${r}px)`,
  };
});

defineExpose({ x, y, moveTo });
</script>

<template>
  <div
    ref="root"
    class="dv-flashlight"
    data-testid="flashlight"
    tabindex="0"
    role="img"
    aria-label="Linterna: mueve el cursor, el dedo o las flechas para iluminar el texto"
    @pointermove="onPointer"
    @mousemove="onPointer"
    @touchmove.passive="onTouch"
    @keydown="onKey"
  >
    <div class="dv-flashlight-shade" :style="maskStyle"></div>
  </div>
</template>
