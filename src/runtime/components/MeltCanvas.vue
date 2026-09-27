<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createMeltRenderer, meltProgress, rasterizeText, type MeltRenderer } from '../typography/meltShader';
import { useAnimationClock } from '../composables/useAnimationClock';

const props = withDefaults(
  defineProps<{
    text: string;
    intensity?: number;
    direction?: 'down' | 'up';
    durationMs?: number;
    font?: string;
    color?: string;
    width?: number;
  }>(),
  { intensity: 0.5, direction: 'down', durationMs: 6000, font: '20px Spectral, serif', color: '#e3e5e8', width: 560 },
);

const emit = defineEmits<{ fallback: []; ready: [] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const active = ref(false);
const { time } = useAnimationClock(active);
let renderer: MeltRenderer | null = null;

function upload() {
  if (!renderer || !canvas.value) return;
  const texture = rasterizeText(props.text, props.width, { font: props.font, color: props.color, lineHeight: 34 });
  if (!texture) return;
  canvas.value.width = texture.width;
  canvas.value.height = texture.height;
  renderer.setTexture(texture);
}

onMounted(() => {
  renderer = canvas.value ? createMeltRenderer(canvas.value) : null;
  if (!renderer) {
    emit('fallback');
    return;
  }
  upload();
  active.value = true;
  emit('ready');
});

watch(
  () => props.text,
  () => upload(),
);

watch(time, (t) => {
  renderer?.render({
    progress: meltProgress(t, props.durationMs),
    intensity: props.intensity,
    direction: props.direction === 'down' ? 1 : -1,
    time: t,
  });
});

onBeforeUnmount(() => renderer?.dispose());
</script>

<template>
  <canvas ref="canvas" class="dv-melt-canvas" aria-hidden="true" data-testid="melt-canvas"></canvas>
</template>
