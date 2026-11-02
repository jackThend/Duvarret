<script setup lang="ts">
import { computed, ref } from 'vue';
import { z } from 'zod';
import { useRuntimeServices } from '../services';

const props = defineProps<{ parameters: Record<string, unknown>; title?: string }>();
const emit = defineEmits<{ success: []; failure: []; feedback: [kind: 'click' | 'error' | 'ok'] }>();
const { resolveAsset } = useRuntimeServices();
const RoomSearchParams = z.object({
  image: z.string().catch(''),
  item_label: z.string().catch('Objeto encontrado'),
  item_x: z.number().min(5).max(95).catch(72),
  item_y: z.number().min(5).max(95).catch(64),
  radius_px: z.number().min(50).max(250).catch(120),
});
const config = computed(() => RoomSearchParams.parse(props.parameters));
const room = ref<HTMLElement | null>(null);
const light = ref({ x: 30, y: 30 });
const size = ref({ width: 640, height: 360 });
const found = ref(false);
const lit = computed(() => Math.hypot(
  (light.value.x - config.value.item_x) / 100 * size.value.width,
  (light.value.y - config.value.item_y) / 100 * size.value.height,
) <= config.value.radius_px * 0.65);
function move(event: PointerEvent) {
  const rect = room.value?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return;
  size.value = { width: rect.width, height: rect.height };
  light.value = { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 };
}
function key(event: KeyboardEvent) {
  const directions: Record<string, [number, number]> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
  const direction = directions[event.key];
  if (direction) {
    event.preventDefault();
    const rect = room.value?.getBoundingClientRect();
    if (rect?.width && rect.height) size.value = { width: rect.width, height: rect.height };
    light.value = { x: Math.max(0, Math.min(100, light.value.x + direction[0])), y: Math.max(0, Math.min(100, light.value.y + direction[1])) };
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    collect();
  }
}
function collect() {
  if (!lit.value || found.value) return;
  found.value = true;
  emit('feedback', 'ok');
  emit('success');
}
</script>

<template>
  <div class="dv-room-search">
    <p>Mueve la linterna con el ratón, el dedo o las flechas. Al iluminar un objeto, pulsa Intro o recógelo.</p>
    <div ref="room" class="room" tabindex="0" role="group" :aria-label="title || 'Registrar la habitación con una linterna'" data-testid="room-search" @pointermove="move" @pointerdown="move" @keydown="key">
      <img v-if="config.image" :src="resolveAsset(config.image)" alt="Una habitación oscura que puedes registrar" draggable="false" />
      <div class="shade" :style="{ background: `radial-gradient(circle ${config.radius_px}px at ${light.x}% ${light.y}%, transparent 35%, rgba(0,0,0,.97) 100%)` }"></div>
      <button type="button" class="object" :class="{ lit }" :style="{ left: `${config.item_x}%`, top: `${config.item_y}%` }" :disabled="!lit || found" :aria-label="lit ? `Recoger ${config.item_label}` : 'Objeto fuera de la luz'" data-testid="room-collect" @click.stop="collect">✧</button>
    </div>
    <p role="status" data-testid="room-status">{{ found ? `${config.item_label}: recogido.` : lit ? `${config.item_label}. Pulsa Intro para recogerlo.` : 'Solo ves polvo dentro del haz de luz.' }}</p>
  </div>
</template>

<style scoped>
.dv-room-search { display: grid; gap: .75rem; }
.room { position: relative; aspect-ratio: 16 / 9; min-height: 220px; overflow: hidden; background: #111b1b; border: 1px solid #8d9c89; border-radius: .5rem; touch-action: none; }
.room:focus-visible { outline: 2px solid #e5c591; outline-offset: 4px; }
.room img { width: 100%; height: 100%; object-fit: cover; }
.shade { position: absolute; inset: 0; pointer-events: none; }
.object { position: absolute; transform: translate(-50%, -50%); width: 44px; height: 44px; opacity: 0; color: #ffe4a0; background: transparent; border: 1px solid transparent; font-size: 2rem; cursor: pointer; }
.object.lit { opacity: 1; text-shadow: 0 0 10px #f5dfad; }
.object:focus-visible { outline: 2px solid #ffe4a0; border-radius: 50%; }
</style>
