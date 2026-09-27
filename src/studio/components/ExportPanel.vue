<script setup lang="ts">
import { ref } from 'vue';
import { TARGET_LABELS, type ExportTarget } from '@/core/compiler';
import { isTauri } from '@/core/lore/tauriDriver';
import { useProjectStore } from '../stores/project';
import { compileFromStudio, savePortable, saveExport } from '../services/exporter';
import ExportDialog from './ExportDialog.vue';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const busy = ref<ExportTarget | null>(null);
const message = ref('');
const pending = ref<string[]>([]);
const desktop = isTauri();

const DESCRIPTIONS: Record<ExportTarget, string> = {
  web: 'Una página que funciona en cualquier navegador y se instala como aplicación, también sin conexión. Lista para itch.io.',
  audio_drama: 'La obra sin pantalla, para escuchar con auriculares, con su guion accesible para lectores de pantalla.',
  native: 'Un programa de escritorio ligero que se abre con doble clic.',
};

async function run(target: ExportTarget) {
  busy.value = target;
  message.value = '';
  pending.value = [];
  try {
    const result = await compileFromStudio({ manifest: project.manifest, assetBase: project.assetBase, target });
    if (!result.ok) {
      message.value = 'La obra tiene escenas por resolver antes de publicarse.';
      return;
    }
    pending.value = result.missingAssets;
    const root = project.storage.kind === 'tauri' ? project.storage.location : null;
    const saved = target === 'native' && root ? await savePortable(result, root) : await saveExport(result, root);
    message.value = `Listo: ${saved.location}`;
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'No se pudo exportar la obra.';
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <ExportDialog @close="emit('close')">
    <template #default="{ disabled }">
      <div class="grid gap-3 md:grid-cols-3" data-testid="export-targets">
        <article v-for="target in (['web', 'audio_drama', 'native'] as ExportTarget[])" :key="target" class="dv-pitch flex flex-col gap-2">
          <h3 class="font-semibold text-dv-accent-2">{{ TARGET_LABELS[target] }}</h3>
          <p class="flex-1 text-dv-muted">{{ DESCRIPTIONS[target] }}</p>
          <button
            v-if="target !== 'native' || desktop"
            type="button"
            class="dv-btn-accent self-start"
            :disabled="disabled || busy !== null"
            :data-testid="`export-${target}`"
            @click="run(target)"
          >{{ busy === target ? 'Preparando…' : 'Exportar' }}</button>
          <p v-else class="text-xs text-dv-muted">Disponible en la aplicación de escritorio de Duvarret Studio.</p>
        </article>
      </div>
      <p v-if="message" role="status" class="mt-3" data-testid="export-message">{{ message }}</p>
      <p v-if="pending.length" class="text-xs text-dv-muted" data-testid="export-pending">
        {{ pending.length }} sonidos o imágenes aún no aportados sonarán como tono de prueba o se verán como marcador.
      </p>
    </template>
  </ExportDialog>
</template>
