<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { personalLibrary, searchResources, type PersonalResource } from '../services/personalLibrary';
import { useProjectStore } from '../stores/project';
import Modal from './Modal.vue';
const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const resources = shallowRef<PersonalResource[]>([]), query = ref(''), kind = ref('all'), trash = ref(false);
const busy = ref(false), loading = ref(true), error = ref(''), message = ref('');
const selected = shallowRef<PersonalResource | null>(null), preview = ref(''), name = ref(''), tags = ref(''), confirmDelete = ref<string | null>(null);
const entries = computed(() => searchResources(resources.value, query.value, kind.value, trash.value));
let previewGeneration = 0;
function clearPreview() { previewGeneration++; if (preview.value.startsWith('blob:')) URL.revokeObjectURL(preview.value); preview.value = ''; selected.value = null; }
onBeforeUnmount(clearPreview);
async function refresh() { resources.value = (await personalLibrary.load()).resources; }
async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; error.value = message.value = '';
  try { await action(); await refresh(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'No se pudo actualizar tu biblioteca.'; }
  finally { busy.value = false; loading.value = false; }
}
onMounted(() => void run(refresh));
async function select(resource: PersonalResource) {
  clearPreview(); const generation = previewGeneration;
  selected.value = resource; name.value = resource.name; tags.value = resource.tags.join(', ');
  try { const url = await personalLibrary.url(resource); if (generation !== previewGeneration) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return; } preview.value = url; }
  catch { error.value = 'No se pudo abrir la vista previa. El recurso puede haberse movido o eliminado.'; }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, files = [...input.files ?? []];
  await run(async () => {
    let count = 0; const failures: string[] = [];
    for (const file of files) { try { await personalLibrary.add({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }); count++; } catch { failures.push(file.name); } }
    message.value = `${count} recursos guardados. Los archivos idénticos se conservan una sola vez.`;
    if (failures.length) error.value = `No se pudieron guardar: ${failures.join(', ')}.`;
  });
  input.value = '';
}
async function use(resource: PersonalResource) {
  await run(async () => {
    const identity = project.workIdentity(), data = await personalLibrary.read(resource);
    if (identity !== project.workIdentity()) throw new Error('La obra cambió. Vuelve a elegir el recurso.');
    const ext = resource.path.split('.').pop()!;
    const fileName = resource.name.toLowerCase().endsWith(`.${ext}`) ? resource.name : `${resource.name}.${ext}`;
    const path = await project.addAsset({ name: fileName, data }, { collect: false });
    if (identity !== project.workIdentity()) throw new Error('La obra cambió; la copia está en la obra anterior.');
    project.assets.register({ ...resource.provenance, path, title: resource.name, origin: resource.provenance?.origin ?? 'author', status: 'ready', bytes: data.byteLength });
    project.touchAssets(); await project.save();
    message.value = `Copia guardada en «${project.manifest.metadata.title}». Puedes colocarla desde Recursos de esta obra.`;
  });
}
async function update(resource: PersonalResource, restore = false) {
  await run(async () => { await personalLibrary.update(resource.id, { trashedAt: restore ? null : new Date().toISOString() }); clearPreview(); confirmDelete.value = null; });
}
async function saveDetails() {
  if (!selected.value) return;
  const id = selected.value.id;
  await run(async () => { await personalLibrary.update(id, { name: name.value, tags: tags.value.split(',') }); message.value = 'Nombre y etiquetas guardados.'; });
}
</script>
<template>
  <Modal title="Mis recursos" wide @close="emit('close')">
    <div class="space-y-4 text-sm" data-testid="resources-dialog">
      <p class="text-dv-muted">Tu archivo de sonidos, voces e imágenes. Cada obra recibe una copia independiente al usarlos.</p>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="dv-btn-ghost" :aria-pressed="!trash" data-testid="resources-active" @click="trash = false; clearPreview()">Biblioteca</button>
        <button type="button" class="dv-btn-ghost" :aria-pressed="trash" data-testid="resources-trash-tab" @click="trash = true; clearPreview()">Papelera</button>
        <label class="dv-btn-accent cursor-pointer">Añadir archivos<input type="file" multiple accept="audio/*,image/*,.svg,.opus,.flac" class="sr-only" :disabled="busy" data-testid="resources-upload" @change="upload" /></label>
      </div>
      <div class="flex flex-wrap gap-2">
        <input v-model="query" type="search" class="dv-input min-w-0 flex-1" aria-label="Buscar recursos" placeholder="Buscar por nombre, etiqueta, voz, autor o licencia…" data-testid="resources-search" />
        <select v-model="kind" class="dv-select" aria-label="Tipo de recurso" data-testid="resources-kind"><option value="all">Todos</option><option value="audio">Sonidos y voces</option><option value="image">Imágenes</option></select>
      </div>
      <p v-if="loading" role="status">Abriendo tu biblioteca…</p>
      <p v-else-if="!entries.length" class="py-4 text-dv-muted" data-testid="resources-empty">{{ query ? 'No hay coincidencias. Prueba otro nombre o etiqueta.' : trash ? 'La papelera está vacía.' : 'Los recursos que importes o aceptes aparecerán aquí. También puedes añadir archivos o guardar recursos de tus obras anteriores.' }}</p>
      <div class="grid items-start gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ul class="min-w-0 space-y-2" data-testid="personal-resources">
          <li v-for="resource in entries" :key="resource.id" class="dv-pitch !p-3" :data-testid="`resource-${resource.id}`">
            <button type="button" class="w-full text-left" :aria-pressed="selected?.id === resource.id" data-testid="resource-preview" @click="select(resource)"><span class="block break-words font-semibold">{{ resource.name }}</span><span class="text-xs text-dv-muted">{{ resource.kind === 'audio' ? 'Sonido / voz' : 'Imagen' }} · {{ (resource.bytes / 1024).toFixed(0) }} KB<span v-if="resource.tags.length"> · {{ resource.tags.join(' · ') }}</span></span></button>
            <div class="mt-2 flex flex-wrap gap-2">
              <template v-if="!trash"><button type="button" class="dv-btn-accent" :disabled="busy" data-testid="resource-use" @click="use(resource)">Usar en esta obra</button><button type="button" class="dv-btn-ghost" :disabled="busy" data-testid="resource-trash" @click="update(resource)">A papelera</button></template>
              <template v-else><button type="button" class="dv-btn-ghost" :disabled="busy" data-testid="resource-restore" @click="update(resource, true)">Restaurar</button><button type="button" class="dv-btn-ghost text-dv-danger" :disabled="busy" data-testid="resource-delete" @click="confirmDelete = resource.id">Borrar definitivamente…</button>
                <div v-if="confirmDelete === resource.id" class="w-full space-y-2" role="alert"><p>Se borrará la copia de la biblioteca. Las obras conservarán sus copias. No se puede deshacer.</p><button type="button" class="dv-btn-ghost text-dv-danger" :disabled="busy" data-testid="resource-delete-confirm" @click="run(async () => { await personalLibrary.purge(resource.id); clearPreview(); confirmDelete = null; })">Borrar definitivamente</button><button type="button" class="dv-btn-ghost" @click="confirmDelete = null">Cancelar</button></div>
              </template>
            </div>
          </li>
        </ul>
        <section v-if="selected" class="min-w-0 space-y-3 rounded border border-dv-border p-4" aria-label="Vista previa del recurso" data-testid="resource-detail">
          <audio v-if="preview && selected.kind === 'audio'" :src="preview" controls preload="metadata" class="w-full" data-testid="resource-audio" />
          <img v-if="preview && selected.kind === 'image'" :src="preview" :alt="selected.name" class="max-h-52 w-full object-contain" data-testid="resource-image" />
          <label class="block">Nombre<input v-model="name" class="dv-input mt-1 w-full" data-testid="resource-name" /></label>
          <label class="block">Etiquetas, separadas por comas<input v-model="tags" class="dv-input mt-1 w-full" placeholder="lluvia, exterior, noche" data-testid="resource-tags" /></label>
          <button type="button" class="dv-btn-ghost" :disabled="busy" data-testid="resource-save-details" @click="saveDetails">Guardar detalles</button>
          <p v-if="selected.provenance?.author" class="text-xs text-dv-muted">Autoría: {{ selected.provenance.author }}</p><p v-if="selected.provenance?.license" class="break-words text-xs text-dv-muted">{{ selected.provenance.license }}</p><p v-if="selected.provenance?.provider" class="break-words text-xs text-dv-muted">{{ selected.provenance.provider }}</p><p v-if="selected.provenance?.prompt" class="break-words text-xs text-dv-muted">{{ selected.provenance.prompt }}</p>
        </section>
      </div>
      <p v-if="message" role="status" data-testid="resources-message">{{ message }}</p><p v-if="error" role="alert" class="text-dv-danger" data-testid="resources-error">{{ error }}</p>
    </div>
  </Modal>
</template>
