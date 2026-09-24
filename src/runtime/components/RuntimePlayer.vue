<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, watch } from 'vue';
import type { StoryManifest } from '@/core/manifest';
import { MODE_LABELS } from '@/core/manifest';
import { useStoryStore } from '../stores/story';
import { SpatialAudioEngine, fetchAssetLoader } from '../audio/SpatialAudioEngine';
import { Announcer, createSpeechSpeaker } from '../screenless/announcer';
import { RUNTIME_SERVICES, type RuntimeServices } from '../services';
import NodeView from './NodeView.vue';
import InventoryPanel from './InventoryPanel.vue';
import ScreenlessStage from './ScreenlessStage.vue';
import '../runtime.css';

/**
 * Duvarret Runtime: el mismo reproductor que usa el Live Preview del Studio y que se
 * compila en el ejecutable final. Interpreta el manifiesto; jamás ejecuta código de la obra.
 */
const props = withDefaults(
  defineProps<{
    manifest: StoryManifest | Record<string, unknown>;
    /** Prefijo para resolver las rutas de assets del proyecto. */
    assetBase?: string;
    /** `undefined` crea un motor propio; `null` desactiva el audio. */
    audioEngine?: SpatialAudioEngine | null;
    /** Modo embebido del Studio: sin portada ni guardado. */
    embedded?: boolean;
    startNode?: string;
    readingSpeed?: number;
    persistKey?: string;
  }>(),
  { assetBase: '', audioEngine: undefined, embedded: false, startNode: undefined, readingSpeed: 1, persistKey: undefined },
);

const emit = defineEmits<{ node: [nodeId: string]; warning: [message: string] }>();
const store = useStoryStore();

const resolveAsset = (path: string) => {
  if (!path || /^(https?:|data:|blob:|asset:)/.test(path) || !props.assetBase) return path;
  return `${props.assetBase.replace(/\/$/, '')}/${path.replace(/^\.?\//, '')}`;
};

const ownsEngine = props.audioEngine === undefined;
const audio: SpatialAudioEngine | null = ownsEngine
  ? new SpatialAudioEngine({
      preferred: (props.manifest as StoryManifest).global_settings?.audio_engine,
      loadAsset: (p) => fetchAssetLoader(resolveAsset(p)),
      onWarning: (m) => emit('warning', m),
    })
  : props.audioEngine;

const announcer = new Announcer(createSpeechSpeaker(), (props.manifest as StoryManifest).metadata?.language ?? 'es-ES');
const services: RuntimeServices = { audio, announcer, resolveAsset };
provide(RUNTIME_SERVICES, services);

const started = ref(props.embedded);
const showInventory = ref(false);
let unbindAudio: (() => void) | null = null;

function load() {
  unbindAudio?.();
  store.load(props.manifest);
  if (audio) unbindAudio = audio.bind(store);
  if (started.value) store.start(props.startNode);
}

watch(() => props.manifest, load, { immediate: true });
watch(
  () => props.startNode,
  (id) => id && store.goTo(id),
);
watch(
  () => store.currentNodeId,
  (id) => {
    if (id) emit('node', id);
    if (!props.embedded && props.persistKey && id) {
      try {
        localStorage.setItem(props.persistKey, JSON.stringify(store.snapshot()));
      } catch {
        /* almacenamiento no disponible */
      }
    }
  },
);

const savedGame = computed(() => {
  if (props.embedded || !props.persistKey) return null;
  try {
    const raw = localStorage.getItem(props.persistKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
});

async function begin(resume = false) {
  started.value = true;
  void audio?.resume().catch(() => undefined);
  if (resume && savedGame.value) {
    store.start();
    store.restore(savedGame.value);
  } else store.start(props.startNode);
}

function unlockAudio() {
  void audio?.resume().catch(() => undefined);
}

function toggleScreenless() {
  store.setMode(store.mode === 'screenless' ? 'visual' : 'screenless');
  unlockAudio();
}

function onKey(event: KeyboardEvent) {
  if (store.mode === 'screenless' || !started.value) return;
  const target = event.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
  if (target?.closest('.dv-sandbox')) return;
  const n = Number(event.key);
  if (Number.isInteger(n) && n >= 1 && n <= 9) {
    const entry = store.availableChoices[n - 1];
    if (entry) {
      store.choose(entry.index);
      event.preventDefault();
    }
  } else if (event.key === 'Enter' && target === event.currentTarget && store.canAdvance) {
    store.advance();
  }
}

const palette = computed(() => {
  const g = store.manifest?.global_settings;
  return {
    '--dv-story-bg': g?.theme_palette.background,
    '--dv-story-fg': g?.theme_palette.foreground,
    '--dv-story-accent': g?.theme_palette.accent,
    '--dv-story-font': g?.font_family_base,
  };
});

const lighting = computed(() => store.currentNode?.ambient_lighting);

onBeforeUnmount(() => {
  unbindAudio?.();
  announcer.silence();
  if (ownsEngine) void audio?.dispose();
});

defineExpose({ store, audio, announcer });
</script>

<template>
  <div
    class="dv-player"
    :class="[lighting ? `dv-light-${lighting}` : '', { 'dv-embedded': embedded }]"
    :style="palette"
    tabindex="-1"
    data-testid="runtime-player"
    @keydown="onKey"
    @pointerdown.once="unlockAudio"
  >
    <header v-if="started" class="dv-player-bar">
      <span class="dv-player-title">{{ store.manifest?.metadata.title }}</span>
      <div class="dv-player-tools">
        <button type="button" class="dv-tool" :aria-pressed="showInventory" data-testid="toggle-inventory" @click="showInventory = !showInventory">🎒 Inventario</button>
        <button
          v-if="store.manifest?.global_settings.allow_screenless_toggle"
          type="button"
          class="dv-tool"
          :aria-pressed="store.mode === 'screenless'"
          data-testid="toggle-screenless"
          @click="toggleScreenless"
        >🎧 {{ MODE_LABELS.audio_drama_screenless }}</button>
      </div>
    </header>

    <section v-if="!started" class="dv-cover" data-testid="cover">
      <h1 class="dv-cover-title">{{ store.manifest?.metadata.title }}</h1>
      <p class="dv-cover-author">{{ store.manifest?.metadata.author }}</p>
      <p v-if="store.manifest?.metadata.genre" class="dv-cover-genre">{{ store.manifest?.metadata.genre }}</p>
      <div class="dv-cover-actions">
        <button type="button" class="dv-continue" data-testid="begin" @click="begin()">Comenzar</button>
        <button v-if="savedGame" type="button" class="dv-link" data-testid="resume" @click="begin(true)">Continuar donde lo dejé</button>
      </div>
      <p class="dv-cover-hint">🎧 Se recomiendan auriculares.</p>
    </section>

    <main v-else-if="store.currentNode" class="dv-player-main">
      <NodeView :key="store.currentNode.node_id" :node="store.currentNode" :reading-speed="readingSpeed" />
      <InventoryPanel v-if="showInventory" :items="store.inventory" :registry="store.manifest?.item_registry ?? {}" />
    </main>
    <p v-else class="dv-empty" data-testid="empty">La obra todavía no tiene escenas.</p>

    <ScreenlessStage v-if="started && store.mode === 'screenless'" @exit="store.setMode('visual')" />
  </div>
</template>
