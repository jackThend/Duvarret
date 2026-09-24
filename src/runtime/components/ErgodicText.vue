<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { TypographicEngine } from '@/core/manifest';
import { computeTypographyFrame, createFallWorld, isWorldAtRest, stepFallWorld, type FallWorld } from '../typography/effects';
import { useAnimationClock, usePrefersReducedMotion } from '../composables/useAnimationClock';
import MeltCanvas from './MeltCanvas.vue';
import FlashlightMask from './FlashlightMask.vue';

const props = defineProps<{ text: string; engine?: TypographicEngine; extraTexts?: string[] }>();

const reducedMotion = usePrefersReducedMotion();
const animated = computed(() => !!props.engine && props.engine.layout_mode !== 'standard' || !!props.engine?.heartbeat_sync?.enabled || !!props.engine?.flicker_effect);
const { time } = useAnimationClock(animated);
const frame = computed(() => computeTypographyFrame(props.engine, time.value, { reducedMotion: reducedMotion.value }));

const paragraphs = computed(() => props.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean));
const words = computed(() => props.text.split(/\s+/).filter(Boolean));

// Licuado: WebGL si está disponible; si no, animación CSS equivalente.
const meltFallback = ref(false);
const meltReady = ref(false);
const melt = computed(() => props.engine?.melt);

// Física textual.
const world = ref<FallWorld | null>(null);
const column = ref<HTMLElement | null>(null);
let physicsTimer: ReturnType<typeof setInterval> | undefined;

function startPhysics() {
  stopPhysics();
  if (!frame.value.layers.physics || reducedMotion.value) return;
  const floor = Math.max(120, (column.value?.clientHeight ?? 300) * 0.9);
  world.value = createFallWorld(words.value.length, floor, props.engine?.physics?.gravity ?? 9.8, props.engine?.physics?.bounce_factor ?? 0.4);
  physicsTimer = setInterval(() => {
    if (!world.value) return;
    world.value = stepFallWorld(world.value, 1 / 60);
    if (isWorldAtRest(world.value)) stopPhysics();
  }, 1000 / 60);
}

function stopPhysics() {
  if (physicsTimer) clearInterval(physicsTimer);
  physicsTimer = undefined;
}

onMounted(startPhysics);
watch([() => props.text, () => frame.value.layers.physics], startPhysics);
onBeforeUnmount(stopPhysics);

function wordStyle(index: number) {
  const body = world.value?.bodies[index];
  if (!body) return undefined;
  return { transform: `translate(${body.x.toFixed(1)}px, ${body.y.toFixed(1)}px) rotate(${body.rotation.toFixed(1)}deg)` };
}

function meltDelay(index: number) {
  return { animationDelay: `${((index * 97) % 23) * 90}ms`, animationDuration: `${melt.value?.duration_ms ?? 6000}ms` };
}
</script>

<template>
  <div class="dv-ergodic-stage" data-testid="ergodic-stage">
    <div
      ref="column"
      :class="[...frame.classes, { 'dv-melt-hidden': frame.layers.melt && meltReady, 'dv-melt-fallback': frame.layers.melt && meltFallback }]"
      :style="frame.style"
      class="dv-column"
      data-testid="ergodic-column"
    >
      <p v-if="frame.layers.physics || (frame.layers.melt && meltFallback)" class="dv-words">
        <span
          v-for="(word, i) in words"
          :key="i"
          class="dv-word"
          :style="frame.layers.physics ? wordStyle(i) : meltDelay(i)"
        >{{ word }} </span>
      </p>
      <template v-else>
        <p v-for="(paragraph, i) in paragraphs" :key="i">{{ paragraph }}</p>
      </template>
      <p v-for="(extra, i) in extraTexts ?? []" :key="`extra-${i}`" class="dv-extra" data-testid="extra-text">{{ extra }}</p>
    </div>
    <MeltCanvas
      v-if="frame.layers.melt && !meltFallback"
      :text="text"
      :intensity="melt?.intensity"
      :direction="melt?.direction"
      :duration-ms="melt?.duration_ms"
      @fallback="meltFallback = true"
      @ready="meltReady = true"
    />
    <FlashlightMask
      v-if="frame.layers.flashlight"
      :radius-px="engine?.flashlight_reveal?.radius_px"
      :darkness-opacity="engine?.flashlight_reveal?.darkness_opacity"
    />
  </div>
</template>
