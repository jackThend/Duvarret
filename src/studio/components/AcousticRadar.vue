<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AcousticEvent, Coordinates } from '@/core/manifest';
import { describePosition, fromRadar, toRadar } from '@/runtime/audio/coordinates';

/**
 * Radar psicoacústico 3D: vista cenital con la cabeza del oyente en el centro (mirando hacia
 * arriba = delante). Las fuentes se arrastran con el ratón, el dedo o las flechas del teclado.
 */
const props = withDefaults(defineProps<{ events: AcousticEvent[]; rangeM?: number; size?: number }>(), { rangeM: 10, size: 220 });
const emit = defineEmits<{ move: [eventId: string, coordinates: Coordinates]; preview: [eventId: string, coordinates: Coordinates] }>();

const svg = ref<SVGSVGElement | null>(null);
const dragging = ref<string | null>(null);
const live = ref<Record<string, Coordinates>>({});
const announcement = ref('');
const r = computed(() => props.size / 2 - 12);

const points = computed(() =>
  props.events.map((e) => {
    const coords = live.value[e.event_id] ?? e.coordinates;
    const { rx, ry } = toRadar(coords, props.rangeM);
    return { event: e, coords, cx: props.size / 2 + rx * r.value, cy: props.size / 2 + ry * r.value };
  }),
);

function toCoords(clientX: number, clientY: number, y: number): Coordinates {
  const rect = svg.value!.getBoundingClientRect();
  const scale = rect.width ? props.size / rect.width : 1;
  const px = (clientX - rect.left) * scale - props.size / 2;
  const py = (clientY - rect.top) * scale - props.size / 2;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return fromRadar(clamp(px / r.value), clamp(py / r.value), props.rangeM, y);
}

function onDown(event: PointerEvent, id: string) {
  dragging.value = id;
  (event.target as Element).setPointerCapture?.(event.pointerId);
}

function onMove(event: PointerEvent) {
  const id = dragging.value;
  if (!id) return;
  const source = props.events.find((e) => e.event_id === id);
  if (!source) return;
  const coords = toCoords(event.clientX, event.clientY, source.coordinates.y);
  live.value = { ...live.value, [id]: coords };
  emit('preview', id, coords);
}

function commit(id: string) {
  const coords = live.value[id];
  if (coords) {
    emit('move', id, coords);
    announcement.value = `${props.events.find((e) => e.event_id === id)?.label ?? id}: ${describePosition(coords)}`;
  }
  const { [id]: _done, ...rest } = live.value;
  live.value = rest;
}

function onUp() {
  if (dragging.value) commit(dragging.value);
  dragging.value = null;
}

function onKey(event: KeyboardEvent, e: AcousticEvent) {
  const step = event.shiftKey ? 2 : 0.5;
  const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  const d = delta[event.key];
  if (!d) return;
  event.preventDefault();
  const round = (v: number) => Math.round(v * 10) / 10;
  const coords = { x: round(e.coordinates.x + d[0]), y: e.coordinates.y, z: round(e.coordinates.z + d[1]) };
  live.value = { ...live.value, [e.event_id]: coords };
  commit(e.event_id);
}
</script>

<template>
  <figure class="dv-radar" data-testid="acoustic-radar">
    <figcaption class="dv-section-title">Radar acústico 3D</figcaption>
    <svg
      ref="svg"
      :viewBox="`0 0 ${size} ${size}`"
      :width="size"
      :height="size"
      role="group"
      aria-label="Posición de los sonidos alrededor del oyente"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointerleave="onUp"
    >
      <circle v-for="k in 3" :key="k" :cx="size / 2" :cy="size / 2" :r="(r * k) / 3" class="dv-radar-ring" />
      <line :x1="size / 2" :y1="12" :x2="size / 2" :y2="size - 12" class="dv-radar-axis" />
      <line :x1="12" :y1="size / 2" :x2="size - 12" :y2="size / 2" class="dv-radar-axis" />
      <text :x="size / 2" y="10" class="dv-radar-label" text-anchor="middle">delante</text>
      <text :x="size / 2" :y="size - 2" class="dv-radar-label" text-anchor="middle">detrás</text>
      <polygon :points="`${size / 2},${size / 2 - 9} ${size / 2 - 7},${size / 2 + 6} ${size / 2 + 7},${size / 2 + 6}`" class="dv-radar-listener" aria-label="Oyente" />
      <g
        v-for="p in points"
        :key="p.event.event_id"
        class="dv-radar-source"
        :class="{ 'is-dragging': dragging === p.event.event_id }"
        tabindex="0"
        role="button"
        :aria-label="`${p.event.label ?? p.event.event_id}, ${describePosition(p.coords)}. Usa las flechas para moverlo.`"
        :data-testid="`radar-${p.event.event_id}`"
        @pointerdown="onDown($event, p.event.event_id)"
        @keydown="onKey($event, p.event)"
      >
        <circle :cx="p.cx" :cy="p.cy" r="7" />
        <text :x="p.cx + 10" :y="p.cy + 4" class="dv-radar-name">{{ p.event.label ?? p.event.event_id }}</text>
      </g>
    </svg>
    <p v-if="!events.length" class="text-xs text-dv-muted">Esta escena aún no tiene sonidos situados.</p>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
  </figure>
</template>
