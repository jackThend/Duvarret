<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, assetUsages, missingAssetIssues } from '@/core/assets/usages';
import { presentAssets } from '../services/assetProbe';
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

/** Archivos que la obra usa pero no existen: se avisa al abrir, sin bloquear (decisión §4.3 de docs/11). */
const ACCEPT = [...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS].map((e) => `.${e}`).join(',');
const missing = ref<Set<string> | null>(null);
const provideError = ref('');
const missingIssues = computed(() => (missing.value ? missingAssetIssues(project.manifest, missing.value) : []));
async function probe() {
  const referenced = [...assetUsages(project.manifest).keys()];
  const present = await presentAssets(referenced, project.resolveAsset, project.assetOverrides);
  missing.value = new Set(referenced.filter((path) => !present.has(path)));
}
onMounted(probe);
async function provide(event: Event, path: string) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  provideError.value = '';
  try {
    await project.addAsset({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }, { replacePath: path });
    studio.previewNonce++;
    await probe();
  } catch (cause) { provideError.value = cause instanceof Error ? cause.message : String(cause); }
}
function goTo(nodeId: string) { project.select(nodeId); emit('close'); }
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
      <p v-else class="text-dv-muted" data-testid="export-ready">La estructura de la obra está lista.{{ missing === null ? ' Comprobando sus sonidos e imágenes…' : missingIssues.length ? '' : ' Todos sus sonidos e imágenes están en su sitio.' }}</p>
      <section v-if="missingIssues.length" role="alert" class="dv-margin-note" data-testid="export-missing-assets">
        <p class="font-semibold">{{ missingIssues.length === 1 ? 'Falta un archivo' : `Faltan ${missingIssues.length} archivos` }}. Puedes exportar igualmente, pero quien lea oirá un tono de prueba o verá un marcador:</p>
        <ul class="mt-2 space-y-2">
          <li v-for="(issue, i) in missingIssues" :key="i" class="flex flex-wrap items-center gap-2" :data-testid="`export-missing-${issue.path.split('/').pop()}`">
            <button v-if="issue.nodeId" type="button" class="flex-1 text-left underline" data-testid="export-missing-go" @click="goTo(issue.nodeId!)">{{ issue.message }}</button>
            <span v-else class="flex-1">{{ issue.message }}</span>
            <label class="dv-btn-ghost shrink-0 cursor-pointer">
              Aportar archivo
              <input type="file" :accept="ACCEPT" class="sr-only" data-testid="export-missing-provide" @change="provide($event, issue.path)" />
            </label>
          </li>
        </ul>
        <p v-if="provideError" class="mt-2 text-dv-danger" data-testid="export-missing-error">{{ provideError }}</p>
      </section>
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
