<script setup lang="ts">
import { WORK_MODES, WORK_MODE_LABELS, type WorkMode } from '@/core/project';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';

const project = useProjectStore();
const studio = useStudioStore();

function setMode(event: Event) {
  project.meta = { ...project.meta, mode: (event.target as HTMLSelectElement).value as WorkMode };
}
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-3 border-b border-dv-border bg-dv-panel px-3 text-sm" role="banner">
    <button type="button" class="dv-icon-btn" :aria-pressed="!studio.leftCollapsed" aria-label="Mostrar u ocultar la estructura de la obra" data-testid="toggle-left" @click="studio.leftCollapsed = !studio.leftCollapsed">≡</button>
    <span class="font-semibold tracking-[0.18em] text-dv-muted">DUVARRET STUDIO</span>
    <span class="text-dv-muted" aria-hidden="true">─</span>
    <input
      class="min-w-0 flex-1 truncate bg-transparent font-prose text-base text-dv-text outline-none focus-visible:underline"
      :value="project.manifest.metadata.title"
      aria-label="Título de la obra"
      data-testid="work-title"
      @change="project.setMetadata({ title: ($event.target as HTMLInputElement).value || 'Obra sin título' })"
    />
    <span v-if="project.dirty" class="text-xs text-dv-muted" data-testid="dirty">sin guardar</span>
    <label class="flex items-center gap-2 text-dv-muted">
      <span class="sr-only md:not-sr-only">Modo</span>
      <select class="dv-select" :value="project.meta.mode" aria-label="Modo de trabajo" @change="setMode">
        <option v-for="mode in WORK_MODES" :key="mode" :value="mode">{{ WORK_MODE_LABELS[mode] }}</option>
      </select>
    </label>
    <button type="button" class="dv-btn-ghost" data-testid="open-import" @click="studio.importOpen = true">Importar manuscrito</button>
    <button type="button" class="dv-btn-ghost" data-testid="save" @click="project.save()">Guardar</button>
    <button type="button" class="dv-icon-btn" aria-label="Preferencias" data-testid="open-settings" @click="studio.settingsOpen = true">⚙</button>
    <button type="button" class="dv-btn-accent" data-testid="open-export" @click="studio.exportOpen = true">▶ Exportar</button>
  </header>
</template>
