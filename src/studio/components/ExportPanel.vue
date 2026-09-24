<script setup lang="ts">
import ExportDialog from './ExportDialog.vue';

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <ExportDialog @close="emit('close')" />
</template>
