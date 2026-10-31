<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
withDefaults(defineProps<{ busy?: boolean }>(), { busy: false });
const project = useProjectStore();
const studio = useStudioStore();
function repairVoice() { emit('close'); studio.narrationOpen = true; }
const blocking = computed(() => project.integrity.filter((i) => i.severity === 'error'));
const warnings = computed(() => project.integrity.filter((i) => i.severity === 'warning'));
</script>

<template>
  <Modal title="Preparar la obra para compartir" :dismissible="!busy" wide @close="emit('close')">
    <div class="space-y-4 text-sm" data-testid="export-dialog">
      <div v-if="blocking.length" role="alert" class="dv-margin-note" data-testid="export-blocking">
        <p class="font-semibold">Para poder exportar, resuelve antes:</p>
        <ul class="mt-1 list-disc pl-5">
          <li v-for="(issue, i) in blocking" :key="i">
            <button v-if="issue.nodeId" type="button" class="underline" @click="project.select(issue.nodeId!); emit('close')">{{ issue.message }}</button>
            <span v-else>{{ issue.message }}</span>
          </li>
        </ul>
        <button v-if="blocking.some(issue => issue.code === 'narration_outdated')" type="button" class="dv-btn-accent mt-3" data-testid="export-fix-voice" @click="repairVoice">Actualizar la voz de la obra</button>
      </div>
      <p v-else class="text-dv-muted" data-testid="export-ready">La estructura de la obra está lista. Comprobaremos los sonidos y las imágenes al preparar el archivo.</p>
      <details v-if="warnings.length" class="text-dv-muted">
        <summary>{{ warnings.length }} observaciones menores</summary>
        <ul class="mt-1 list-disc pl-5" data-testid="export-warnings">
          <li v-for="(w, i) in warnings" :key="i">
            <button v-if="w.nodeId" type="button" class="underline" @click="project.select(w.nodeId!); emit('close')">{{ w.message }}</button>
            <span v-else>{{ w.message }}</span>
          </li>
        </ul>
      </details>
      <p v-if="project.narrationBusy" role="status" class="text-dv-muted">La voz se está actualizando. En cuanto termine podrás preparar la publicación.</p>
      <slot :disabled="!project.canExport || project.narrationBusy" />
    </div>
  </Modal>
</template>
