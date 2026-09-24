<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Character, VisualNovelOverlay } from '@/core/manifest';
import { useTypewriter } from '../composables/useTypewriter';
import { usePrefersReducedMotion } from '../composables/useAnimationClock';
import { useRuntimeServices } from '../services';

const props = withDefaults(
  defineProps<{
    overlay: VisualNovelOverlay;
    characters: Record<string, Character>;
    cps?: number;
    backlog?: { speaker?: string; text: string }[];
  }>(),
  { cps: 45, backlog: () => [] },
);

const emit = defineEmits<{ line: [speaker: string, text: string]; finished: [] }>();
const { resolveAsset } = useRuntimeServices();
const reducedMotion = usePrefersReducedMotion();

const lines = computed(() =>
  props.overlay.lines.length
    ? props.overlay.lines
    : [{ speaker: props.overlay.active_speaker, mood: props.overlay.current_mood, text: props.overlay.dialogue_text, position: props.overlay.avatar_position }],
);

const index = ref(0);
const showBacklog = ref(false);
const failedSprites = ref<Set<string>>(new Set());
const line = computed(() => lines.value[Math.min(index.value, lines.value.length - 1)]!);
const character = computed<Character | undefined>(() => props.characters[line.value.speaker]);
const name = computed(() => character.value?.name ?? line.value.speaker);
const accent = computed(() => character.value?.color_accent ?? '#94a3b8');
const sprite = computed(() => {
  const sprites = character.value?.sprites ?? {};
  const path = sprites[line.value.mood] ?? sprites.neutral ?? Object.values(sprites)[0];
  return path && !failedSprites.value.has(path) ? path : null;
});
const initials = computed(() =>
  name.value
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
);

const text = computed(() => line.value.text);
const cps = computed(() => props.cps);
const typewriter = useTypewriter(text, cps, reducedMotion);

watch(
  () => typewriter.done.value,
  (done) => {
    if (done) emit('line', line.value.speaker, line.value.text);
  },
);

function next() {
  if (!typewriter.done.value) {
    typewriter.complete();
    return;
  }
  if (index.value < lines.value.length - 1) index.value++;
  else emit('finished');
}

function onSpriteError() {
  if (sprite.value) failedSprites.value = new Set([...failedSprites.value, sprite.value]);
}
</script>

<template>
  <div class="dv-vn" data-testid="visual-novel" role="dialog" :aria-label="`Diálogo con ${name}`">
    <div class="dv-vn-stage" :class="`dv-vn-${line.position}`">
      <img
        v-if="sprite"
        :src="resolveAsset(sprite)"
        :alt="`${name}, ${line.mood}`"
        class="dv-vn-avatar"
        data-testid="vn-avatar"
        @error="onSpriteError"
      />
      <div v-else class="dv-vn-avatar dv-vn-placeholder" :style="{ borderColor: accent, color: accent }" data-testid="vn-placeholder" aria-hidden="true">
        {{ initials }}
      </div>
    </div>
    <div class="dv-vn-box" tabindex="0" data-testid="vn-box" @click="next" @keydown.enter.prevent="next" @keydown.space.prevent="next">
      <div class="dv-vn-name" :style="{ color: accent }">{{ name }} <span class="dv-vn-mood">· {{ line.mood }}</span></div>
      <p class="dv-vn-text" aria-hidden="true" data-testid="vn-text">{{ typewriter.visible.value }}<span v-if="!typewriter.done.value" class="dv-vn-caret">▍</span></p>
      <p class="sr-only" aria-live="polite">{{ typewriter.done.value ? `${name}: ${line.text}` : '' }}</p>
      <div class="dv-vn-actions">
        <button type="button" class="dv-vn-btn" data-testid="vn-backlog-toggle" @click.stop="showBacklog = !showBacklog">Historial</button>
        <span class="dv-vn-hint">{{ index + 1 }} / {{ lines.length }} · clic o Intro</span>
      </div>
    </div>
    <div v-if="showBacklog" class="dv-vn-backlog" data-testid="vn-backlog" role="log" aria-label="Historial del diálogo">
      <p v-for="(entry, i) in backlog" :key="i">
        <strong v-if="entry.speaker">{{ characters[entry.speaker]?.name ?? entry.speaker }}: </strong>{{ entry.text }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.dv-vn {
  position: relative;
  margin-top: 1.5rem;
  display: grid;
  gap: 0.75rem;
  animation: dv-vn-in 380ms ease-out both;
}
@keyframes dv-vn-in {
  from { opacity: 0; transform: translateY(12px); }
}
.dv-vn-stage { display: flex; }
.dv-vn-left { justify-content: flex-start; }
.dv-vn-center { justify-content: center; }
.dv-vn-right { justify-content: flex-end; }
.dv-vn-avatar {
  width: 7.5rem;
  height: 7.5rem;
  object-fit: cover;
  border-radius: 0.75rem;
}
.dv-vn-placeholder {
  display: grid;
  place-items: center;
  border: 2px solid;
  font: 600 2rem var(--dv-font-prose);
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.dv-vn-box {
  background: color-mix(in srgb, var(--dv-story-bg, #0c0e12) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--dv-story-fg, #e3e5e8) 18%, transparent);
  border-radius: 0.75rem;
  padding: 0.9rem 1.1rem;
  cursor: pointer;
  backdrop-filter: blur(6px);
}
.dv-vn-name { font-weight: 600; letter-spacing: 0.02em; }
.dv-vn-mood { opacity: 0.55; font-weight: 400; font-size: 0.85em; }
.dv-vn-text { margin-top: 0.35rem; font-family: var(--dv-font-prose); font-size: 1.1rem; line-height: 1.6; min-height: 3.2em; }
.dv-vn-caret { animation: dv-blink 1s steps(2) infinite; opacity: 0.6; }
@keyframes dv-blink { 50% { opacity: 0; } }
.dv-vn-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 0.4rem; font-size: 0.75rem; opacity: 0.7; }
.dv-vn-btn { border: 1px solid currentColor; border-radius: 999px; padding: 0.1rem 0.7rem; background: transparent; color: inherit; cursor: pointer; }
.dv-vn-backlog { max-height: 12rem; overflow: auto; font-size: 0.9rem; opacity: 0.85; border-left: 2px solid var(--dv-story-accent, #d97706); padding-left: 0.8rem; }
</style>
