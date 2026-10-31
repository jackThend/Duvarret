<script setup lang="ts">
import { ref, watch } from 'vue';
import { WORK_MODES, WORK_MODE_LABELS, type WorkMode } from '@/core/project';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';

const project = useProjectStore();
const studio = useStudioStore();
const emit = defineEmits<{ structure: [] }>();
const draftTitle = ref(project.manifest.metadata.title);
const editingTitle = ref(false);
watch(() => project.manifest.metadata.title, value => { if (!editingTitle.value) draftTitle.value = value; });
function updateTitle(event: Event) {
  draftTitle.value = (event.target as HTMLInputElement).value;
  project.setMetadata({ title: draftTitle.value.trim() || 'Obra sin título' });
}

function setMode(event: Event) {
  project.meta = { ...project.meta, mode: (event.target as HTMLSelectElement).value as WorkMode };
  project.dirty = true;
}
</script>

<template>
  <header class="dv-topbar shrink-0 border-b border-dv-border bg-dv-panel text-sm" role="banner">
    <button type="button" class="dv-icon-btn" :aria-pressed="!studio.leftCollapsed" aria-label="Mostrar u ocultar la estructura de la obra" data-testid="toggle-left" @click="studio.leftCollapsed = !studio.leftCollapsed; emit('structure')">≡</button>
    <span class="dv-brand font-semibold tracking-[0.18em] text-dv-muted">DUVARRET STUDIO</span>
    <span class="text-dv-muted" aria-hidden="true">─</span>
    <input
      class="min-w-0 flex-1 truncate bg-transparent font-prose text-base text-dv-text outline-none focus-visible:underline"
      :value="draftTitle"
      aria-label="Título de la obra"
      data-testid="work-title"
      @focus="editingTitle = true"
      @input="updateTitle"
      @blur="editingTitle = false; draftTitle = project.manifest.metadata.title"
    />
    <span class="dv-save-state text-xs text-dv-muted" role="status" data-testid="save-state">{{ project.savingCount ? 'Guardando…' : project.saveError ? 'No se ha guardado' : project.dirty ? 'Cambios sin guardar' : project.lastSavedAt ? 'Todo guardado' : 'Guardado local' }}</span>
    <span v-if="project.dirty" class="sr-only" data-testid="dirty">sin guardar</span>
    <label class="dv-work-mode flex items-center gap-2 text-dv-muted">
      <span class="sr-only md:not-sr-only">Modo</span>
      <select class="dv-select" :value="project.meta.mode" aria-label="Modo de trabajo" @change="setMode">
        <option v-for="mode in WORK_MODES" :key="mode" :value="mode">{{ WORK_MODE_LABELS[mode] }}</option>
      </select>
    </label>
    <button type="button" class="dv-btn-ghost" data-testid="open-works" @click="studio.worksOpen = true">Obras</button>
    <button type="button" class="dv-btn-ghost" data-testid="open-import" @click="studio.importOpen = true">Importar manuscrito</button>
    <button type="button" class="dv-icon-btn" aria-label="Deshacer" :disabled="!project.canUndo" data-testid="undo" @click="project.undo()">↶</button>
    <button type="button" class="dv-icon-btn" aria-label="Rehacer" :disabled="!project.canRedo" data-testid="redo" @click="project.redo()">↷</button>
    <button type="button" class="dv-btn-ghost" :disabled="!!project.savingCount" data-testid="save" @click="project.save().catch(() => undefined)">Guardar</button>
    <button type="button" class="dv-icon-btn" aria-label="Preferencias" data-testid="open-settings" @click="studio.settingsOpen = true">⚙</button>
    <button type="button" class="dv-btn-accent" data-testid="open-export" @click="studio.exportOpen = true">▶ Exportar</button>
  </header>
</template>
