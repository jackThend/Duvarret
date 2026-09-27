<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore } from '../stores/project';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const blocking = computed(() => project.integrity.filter((i) => i.severity === 'error'));
const warnings = computed(() => project.integrity.filter((i) => i.severity === 'warning'));
</script>

<template>
  <Modal title="Exportar la obra" wide @close="emit('close')">
    <div class="space-y-4 text-sm" data-testid="export-dialog">
      <div v-if="blocking.length" role="alert" class="dv-margin-note" data-testid="export-blocking">
        <p class="font-semibold">Antes de exportar, conviene resolver:</p>
        <ul class="mt-1 list-disc pl-5">
          <li v-for="(issue, i) in blocking" :key="i">
            <button v-if="issue.nodeId" type="button" class="underline" @click="project.select(issue.nodeId!); emit('close')">{{ issue.message }}</button>
            <span v-else>{{ issue.message }}</span>
          </li>
        </ul>
      </div>
      <p v-else class="text-dv-muted" data-testid="export-ready">La obra está lista para publicarse.</p>
      <details v-if="warnings.length" class="text-dv-muted">
        <summary>{{ warnings.length }} observaciones menores</summary>
        <ul class="mt-1 list-disc pl-5"><li v-for="(w, i) in warnings" :key="i">{{ w.message }}</li></ul>
      </details>
      <slot :disabled="!project.canExport" />
    </div>
  </Modal>
</template>
