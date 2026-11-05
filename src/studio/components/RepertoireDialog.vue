<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, shallowRef } from 'vue';
import Modal from './Modal.vue';
import ModuleSandbox from '@/runtime/modules/ModuleSandbox.vue';
import { RUNTIME_SERVICES } from '@/runtime/services';
import { Announcer } from '@/runtime/screenless/announcer';
import { MAX_SCENE_FILE, decodeSceneAsset, type ScenePackage } from '@/core/repertoire/package';
import { isNarrativeType, NARRATIVE_SCENES } from '@/core/gameplay/narrative';
import { mimeFor } from '@/core/assets/usages';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import { applyScene, captureScene, favoriteScene, filterScenes, getScene, refreshRepertoire, storeScene, suggestScenes, type RepertoireEntry } from '../services/repertoire';
import { download } from '../services/exporter';
import { writeProjectBytes } from '../services/nativeBytes';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const studio = useStudioStore();
const tab = ref('all');
const query = ref('');
const name = ref(project.selectedNode?.gameplay_overlay?.title || '');
const description = ref('');
const tags = ref('');
const busy = ref(false);
const error = ref('');
const message = ref('');
const replace = ref(false);
const selected = shallowRef<ScenePackage>();
const selectedId = ref('');
const previewKey = ref(0);
const urls = new Map<string, string>();
const playable = computed(() => isNarrativeType(project.selectedNode?.gameplay_overlay?.type || ''));
const suggested = computed(() => new Set(suggestScenes(studio.repertoirePrompt || project.selectedNode?.text_payload || '').map(entry => entry.id)));
const entries = computed(() => filterScenes(query.value).filter(entry => {
  if (tab.value === 'favorites') return entry.favorite;
  if (tab.value === 'suggested') return suggested.value.has(entry.id);
  if (tab.value === 'mine') return !isNarrativeType(entry.id);
  return true;
}));
provide(RUNTIME_SERVICES, { audio: null, announcer: new Announcer(), resolveAsset: path => urls.get(path) ?? '' });
function clearPreview() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}
let active = true;
onBeforeUnmount(() => { active = false; clearPreview(); });
async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = message.value = '';
  try { await action(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
try { refreshRepertoire(); }
catch { error.value = 'No se pudo leer el catálogo local de Repertorio.'; }
if (studio.repertoirePrompt) tab.value = 'suggested';

function open(entry: RepertoireEntry) {
  return run(async () => {
    const pack = await getScene(entry.id);
    if (!active) return;
    clearPreview();
    for (const [path, data] of Object.entries(pack.assets)) {
      urls.set(path, URL.createObjectURL(new Blob([decodeSceneAsset(data).slice().buffer], { type: mimeFor(path) })));
    }
    selected.value = pack;
    selectedId.value = entry.id;
    replace.value = false;
    previewKey.value++;
  });
}
function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  return run(async () => {
    if (file.size > MAX_SCENE_FILE) throw new Error('La escena supera el límite de 24 MiB.');
    await storeScene(await file.text());
    tab.value = 'mine';
    query.value = '';
    message.value = 'Escena importada en Mis escenas.';
  });
}
async function exportPack(pack: ScenePackage) {
  const filename = pack.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'escena';
  const bytes = new TextEncoder().encode(JSON.stringify(pack));
  if (project.storage.kind === 'tauri') {
    const root = project.storage.location;
    const { invoke } = await import('@tauri-apps/api/core');
    const path = `export/${filename}-${crypto.randomUUID().slice(0, 8)}.duvescena`;
    await writeProjectBytes(root, path, bytes, invoke);
    message.value = `Archivo guardado en ${path}.`;
  } else download(filename + '.duvescena', bytes, 'application/json');
}
function shareCurrent(save: boolean) {
  return run(async () => {
    const pack = await captureScene(project, name.value, description.value, tags.value.split(',').map(t => t.trim()).filter(Boolean));
    if (save) {
      await storeScene(JSON.stringify(pack));
      tab.value = 'mine';
      query.value = '';
      message.value = 'Escena guardada en tu Repertorio.';
    } else await exportPack(pack);
  });
}
function useSelected() {
  return run(async () => {
    if (!selected.value) return;
    await applyScene(project, selected.value, replace.value);
    studio.previewNonce++;
    studio.playableSceneType = selected.value.overlay.type;
    emit('close');
    studio.playableSceneOpen = true;
  });
}
</script>

<template>
  <Modal title="Repertorio" wide :dismissible="!busy" @close="emit('close')">
    <div class="space-y-4 text-sm" data-testid="repertoire-dialog">
      <p>Prueba, comparte y reutiliza escenas narrativas en tus obras.</p>
      <div class="flex flex-wrap gap-2">
        <button v-for="option in [{ id: 'all', name: 'Todas' }, { id: 'suggested', name: 'Sugeridas' }, { id: 'favorites', name: 'Favoritas' }, { id: 'mine', name: 'Mis escenas' }]" :key="option.id" type="button" class="dv-btn-ghost" :aria-pressed="tab === option.id" :data-testid="'repertoire-' + option.id" @click="tab = option.id">{{ option.name }}</button>
      </div>
      <div class="flex flex-wrap items-end gap-3">
        <label class="min-w-48 flex-1">Buscar por nombre o etiquetas<input v-model="query" type="search" class="dv-input mt-1 w-full" data-testid="repertoire-search" /></label>
        <label class="dv-btn-ghost cursor-pointer">Importar .duvescena<input type="file" accept=".duvescena,.json" class="sr-only" :disabled="busy" data-testid="repertoire-import" @change="importFile" /></label>
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <ul class="max-h-72 space-y-2 overflow-auto" aria-label="Escenas disponibles">
          <li v-for="entry in entries" :key="entry.id" class="flex items-start gap-2 rounded border border-dv-border p-2" data-testid="repertoire-entry">
            <button type="button" class="min-w-0 flex-1 break-words text-left" :disabled="busy" :aria-pressed="selectedId === entry.id" @click="open(entry)">
              <strong>{{ entry.name }}</strong>
              <span class="block text-dv-muted">{{ entry.description }}</span>
              <span v-if="entry.tags.length" class="block text-xs">{{ entry.tags.join(' · ') }}</span>
            </button>
            <button type="button" class="dv-btn-ghost" :disabled="busy" :aria-pressed="entry.favorite" :aria-label="'Favorita: ' + entry.name" @click="run(() => favoriteScene(entry))">{{ entry.favorite ? '★' : '☆' }}</button>
          </li>
          <li v-if="!entries.length" class="text-dv-muted">No hay coincidencias en esta vista.</li>
        </ul>
        <section v-if="selected" class="min-w-0 space-y-3 rounded border border-dv-border p-3" aria-label="Vista previa">
          <h3 class="font-semibold">{{ selected.name }}</h3>
          <p class="text-xs text-dv-muted">{{ NARRATIVE_SCENES.find(s => s.type === selected?.overlay.type)?.title }} · Prueba aislada</p>
          <ModuleSandbox :key="previewKey" :overlay="selected.overlay" />
          <label v-if="project.selectedNode?.gameplay_overlay" class="block"><input v-model="replace" type="checkbox" /> Sustituir la mecánica de la escena actual</label>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="dv-btn-ghost" @click="previewKey++">Reiniciar prueba</button>
            <button type="button" class="dv-btn-ghost" :disabled="busy" data-testid="repertoire-export" @click="run(() => exportPack(selected!))">Exportar archivo</button>
            <button type="button" class="dv-btn-accent" :disabled="busy || !project.selectedNode || (!!project.selectedNode.gameplay_overlay && !replace)" data-testid="repertoire-use" @click="useSelected">Añadir y editar</button>
          </div>
        </section>
      </div>
      <details v-if="playable" class="space-y-2 rounded border border-dv-border p-3">
        <summary class="cursor-pointer font-semibold">Compartir la escena guardada en la obra</summary>
        <p class="text-xs text-dv-muted">El archivo lleva sus recursos y resultados. Los saltos a otros pasajes se configuran en la obra de destino.</p>
        <label class="block">Nombre<input v-model="name" maxlength="120" class="dv-input w-full" /></label>
        <label class="block">Descripción<input v-model="description" maxlength="600" class="dv-input w-full" /></label>
        <label class="block">Etiquetas separadas por comas<input v-model="tags" class="dv-input w-full" /></label>
        <button type="button" class="dv-btn-ghost" :disabled="busy || !name.trim()" @click="shareCurrent(true)">Guardar en Repertorio</button>
        <button type="button" class="dv-btn-accent" :disabled="busy || !name.trim()" @click="shareCurrent(false)">Exportar escena actual</button>
      </details>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="error" role="alert" class="text-dv-danger">{{ error }}</p>
    </div>
  </Modal>
</template>
