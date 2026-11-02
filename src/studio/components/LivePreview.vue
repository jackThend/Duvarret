<script setup lang="ts">
import { computed, inject } from 'vue';
import type { Coordinates } from '@/core/manifest';
import RuntimePlayer from '@/runtime/components/RuntimePlayer.vue';
import { useStoryStore } from '@/runtime/stores/story';
import type { SpatialAudioEngine } from '@/runtime/audio/SpatialAudioEngine';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import AcousticRadar from './AcousticRadar.vue';
import { STUDIO_AUDIO } from '../services/audio';

const project = useProjectStore();
const studio = useStudioStore();
const story = useStoryStore();
const audio = inject<SpatialAudioEngine | null>(STUDIO_AUDIO, null);

const startNode = computed(() => studio.previewStartNode ?? project.selectedNodeId ?? undefined);
const events = computed(() => project.selectedNode?.acoustic_events ?? []);
/** Sonidos ausentes de la escena que se está leyendo (y del ambiente de la obra). */
const notes = computed(() => studio.previewNotes.filter((n) => n.nodeId === null || n.nodeId === story.currentNode?.node_id));

function onPreviewMove(eventId: string, coordinates: Coordinates) {
  audio?.move(`${project.selectedNodeId}::${eventId}`, coordinates);
}

function onMove(eventId: string, coordinates: Coordinates) {
  if (!project.selectedNodeId) return;
  project.moveAcousticEvent(project.selectedNodeId, eventId, coordinates);
  void audio?.confirmationPop(coordinates).catch(() => undefined);
}

function toggleScreenless() {
  story.setMode(story.mode === 'screenless' ? 'visual' : 'screenless');
}
</script>

<template>
  <section class="flex h-full flex-col gap-3 p-3" aria-label="Previsualización en vivo" data-testid="live-preview">
    <h2 class="dv-section-title">Previsualización en vivo</h2>
    <div class="dv-preview-frame" :class="{ 'is-mobile': studio.mobilePreview }">
      <RuntimePlayer
        :key="studio.previewNonce"
        :manifest="project.manifest"
        :asset-resolver="project.resolveAsset"
        :audio-engine="audio"
        :start-node="startNode"
        embedded
      />
    </div>
    <div v-if="notes.length" role="status" class="dv-margin-note space-y-1 text-sm" data-testid="preview-audio-notes">
      <p v-for="note in notes" :key="`${note.nodeId}:${note.asset}`" data-testid="preview-audio-note">{{ note.message }}</p>
      <button type="button" class="dv-link" data-testid="preview-audio-provide" @click="studio.assetsOpen = true">Aportar el sonido…</button>
    </div>
    <div class="flex flex-col gap-1.5">
      <button type="button" class="dv-btn-ghost justify-start" data-testid="play-from-here" @click="studio.playFromHere()">▶ Reproducir desde aquí</button>
      <button type="button" class="dv-btn-ghost justify-start" :aria-pressed="story.mode === 'screenless'" data-testid="preview-screenless" @click="toggleScreenless">🎧 Escuchar sin pantalla</button>
      <button type="button" class="dv-btn-ghost justify-start" :aria-pressed="studio.mobilePreview" data-testid="preview-mobile" @click="studio.mobilePreview = !studio.mobilePreview">📱 Probar en formato móvil</button>
    </div>
    <details v-if="events.length" class="text-sm text-dv-muted" data-testid="sound-position-details">
      <summary>Ajustar la posición de los sonidos</summary>
      <AcousticRadar :events="events" @move="onMove" @preview="onPreviewMove" />
    </details>
  </section>
</template>
