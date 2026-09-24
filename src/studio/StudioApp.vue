<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { SpatialAudioEngine, fetchAssetLoader } from '@/runtime/audio/SpatialAudioEngine';
import { useStoryStore } from '@/runtime/stores/story';
import { BrowserStorage, TauriStorage, type ProjectStorage } from '@/core/project';
import { isTauri } from '@/core/lore/tauriDriver';
import { useProjectStore } from './stores/project';
import { useStudioStore } from './stores/studio';
import { useShortcuts, prettyKeys, type Shortcut } from './composables/useShortcuts';
import { STUDIO_AUDIO } from './services/audio';
import { defaultWork } from './services/works';
import TopBar from './components/TopBar.vue';
import LeftPanel from './components/LeftPanel.vue';
import WritingCanvas from './components/WritingCanvas.vue';
import PitchCards from './components/PitchCards.vue';
import AgentChat from './components/AgentChat.vue';
import LivePreview from './components/LivePreview.vue';
import GraphOverlay from './components/GraphOverlay.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import ImportDialog from './components/ImportDialog.vue';
import ExportPanel from './components/ExportPanel.vue';

const props = withDefaults(defineProps<{ storage?: ProjectStorage; audioEngine?: SpatialAudioEngine | null; autoload?: boolean }>(), {
  storage: undefined,
  audioEngine: undefined,
  autoload: true,
});

const project = useProjectStore();
const studio = useStudioStore();
const story = useStoryStore();
const chatRef = ref<InstanceType<typeof AgentChat> | null>(null);
const ready = ref(false);
const status = ref('');

const audio =
  props.audioEngine === undefined
    ? new SpatialAudioEngine({ preferred: 'resonance_3d', loadAsset: (p) => fetchAssetLoader(project.assetBase ? `${project.assetBase.replace(/\/$/, '')}/${p}` : p) })
    : props.audioEngine;
provide(STUDIO_AUDIO, audio);

const shortcuts: Shortcut[] = [
  { keys: 'mod+s', label: 'Guardar', run: () => void save() },
  { keys: 'alt+arrowdown', label: 'Siguiente escena', run: () => project.selectRelative(1) },
  { keys: 'alt+arrowup', label: 'Escena anterior', run: () => project.selectRelative(-1) },
  { keys: 'mod+enter', label: 'Aplicar la propuesta', run: () => studio.openPitches[0] && void studio.applyPitch(studio.openPitches[0].id) },
  { keys: 'mod+shift+p', label: 'Reproducir desde aquí', run: () => studio.playFromHere() },
  { keys: 'mod+shift+a', label: 'Modo 100% audio', run: () => story.setMode(story.mode === 'screenless' ? 'visual' : 'screenless') },
  { keys: 'mod+b', label: 'Mostrar/ocultar estructura', run: () => (studio.leftCollapsed = !studio.leftCollapsed) },
  { keys: 'mod+k', label: 'Hablar con el co-director', run: () => chatRef.value?.focus() },
  { keys: 'mod+z', label: 'Deshacer', run: () => project.undo() },
  { keys: 'mod+shift+z', label: 'Rehacer', run: () => project.redo() },
];
useShortcuts(() => shortcuts);

async function save() {
  try {
    await project.save();
    status.value = 'Obra guardada.';
  } catch (e) {
    status.value = e instanceof Error ? e.message : 'No se pudo guardar.';
  }
}

function defaultStorage(): ProjectStorage {
  if (props.storage) return props.storage;
  if (isTauri()) {
    const path = new URLSearchParams(location.search).get('project');
    if (path) return new TauriStorage(path);
  }
  return new BrowserStorage('obra-actual');
}

onMounted(async () => {
  if (props.autoload) {
    const storage = defaultStorage();
    const work = await defaultWork();
    try {
      await project.openFromStorage(storage, work.manifest);
      if (!project.assetBase) project.assetBase = work.assetBase;
    } catch {
      await project.open({ manifest: work.manifest, storage, assetBase: work.assetBase });
    }
  }
  ready.value = true;
  studio.refreshPitches();
});

watch(
  () => project.selectedNodeId,
  (id) => {
    studio.previewStartNode = null;
    if (id && !studio.pitches.some((p) => p.nodeId === id)) studio.refreshPitches(id);
  },
);

onBeforeUnmount(() => {
  if (props.audioEngine === undefined) void audio?.dispose();
});

const columns = computed(() => (studio.leftCollapsed ? 'minmax(0,0fr) minmax(0,56fr) minmax(0,44fr)' : 'minmax(0,20fr) minmax(0,45fr) minmax(0,35fr)'));
</script>

<template>
  <div class="flex h-full flex-col bg-dv-bg text-dv-text" data-testid="studio">
    <TopBar />
    <div class="dv-workspace grid min-h-0 flex-1" :style="{ gridTemplateColumns: columns }">
      <aside class="min-h-0 overflow-hidden border-r border-dv-border bg-dv-panel" :class="{ invisible: studio.leftCollapsed }" :aria-hidden="studio.leftCollapsed">
        <LeftPanel v-if="!studio.leftCollapsed" />
      </aside>
      <main class="min-h-0 overflow-y-auto">
        <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
          <WritingCanvas v-if="ready" />
          <PitchCards />
          <AgentChat ref="chatRef" />
          <details class="text-xs text-dv-muted">
            <summary>Atajos de teclado</summary>
            <ul class="mt-2 grid grid-cols-2 gap-1">
              <li v-for="s in shortcuts" :key="s.keys"><kbd class="font-ui">{{ prettyKeys(s.keys) }}</kbd> · {{ s.label }}</li>
            </ul>
          </details>
        </div>
      </main>
      <aside class="min-h-0 overflow-y-auto border-l border-dv-border bg-dv-panel">
        <LivePreview v-if="ready" />
      </aside>
    </div>
    <p class="sr-only" role="status" aria-live="polite">{{ status }}</p>
    <GraphOverlay v-if="studio.graphOpen" @close="studio.graphOpen = false" />
    <SettingsDialog v-if="studio.settingsOpen" @close="studio.settingsOpen = false" />
    <ImportDialog v-if="studio.importOpen" @close="studio.importOpen = false" />
    <ExportPanel v-if="studio.exportOpen" @close="studio.exportOpen = false" />
  </div>
</template>
