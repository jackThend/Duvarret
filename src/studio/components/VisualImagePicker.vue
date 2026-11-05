<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { assetFolderFor, mimeFor, MAX_ASSET_BYTES } from '@/core/assets/usages';
import { checkAssetContent } from '@/core/assets/content';
import { proceduralImage } from '@/core/visual/procedural';
import { visualPrompt, type VisualRole, type VisualStyle } from '@/core/visual/style';
import { CLOUD_USAGE_NOTICE, IMAGE_MODELS, CLOUDFLARE_IMAGE_MODELS } from '@/core/ai/catalog';
import { useProjectStore, type GeneratedProvenance } from '../stores/project';
import { useAiStore } from '../stores/ai';
import { generateImage } from '../services/ai';
import { personalLibrary, searchResources, type PersonalResource } from '../services/personalLibrary';
import { removePlainBackground } from '../services/imageCutout';

const props = defineProps<{ role: VisualRole; label: string; description: string; profile: VisualStyle; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [path: string]; busy: [value: boolean] }>();
const project = useProjectStore(), ai = useAiStore();
const source = ref('work'), query = ref(''), libraryId = ref(''), error = ref(''), message = ref(''), busy = ref(false);
const resources = shallowRef<PersonalResource[]>([]);
const images = computed(() => [...project.assetPaths].filter(p => assetFolderFor(p) === 'images'));
const entries = computed(() => searchResources(resources.value, query.value, 'image', false));
const models = computed(() => ai.image.provider === 'cloudflare' ? CLOUDFLARE_IMAGE_MODELS : IMAGE_MODELS);
const candidate = shallowRef<{ data: Uint8Array; name: string; mime: string; url: string; provenance?: GeneratedProvenance } | null>(null);
const identity = project.workIdentity();
let alive = true;
let controller: AbortController | undefined;
function checkWork() { if (!alive || project.workIdentity() !== identity) throw new Error('La obra cambió. Abre de nuevo el editor visual.'); }
function discard() { if (candidate.value) URL.revokeObjectURL(candidate.value.url); candidate.value = null; }
onBeforeUnmount(() => { alive = false; controller?.abort(); discard(); });
onMounted(() => { void ai.initialize(); });
async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; emit('busy', true); error.value = message.value = '';
  try { checkWork(); await action(); }
  catch (cause) { if (alive) error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; emit('busy', false); }
}
function stage(data: Uint8Array, name: string, provenance?: GeneratedProvenance) {
  checkWork();
  if (data.byteLength > MAX_ASSET_BYTES) throw new Error('La imagen supera el máximo de 50 MB.');
  const result = checkAssetContent(name, data);
  if (!result.ok) throw new Error(result.reason);
  discard(); const mime = mimeFor(result.name);
  candidate.value = { data, name: result.name, mime, provenance, url: URL.createObjectURL(new Blob([data.slice().buffer], { type: mime })) };
}
function code() {
  void run(async () => { stage(proceduralImage(props.description, props.role, props.profile), `${props.role}-codigo.svg`, { provider: 'Duvarret · plantillas por código', prompt: props.description, style_preset: props.profile.style, title: props.description }); });
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
  if (file) await run(async () => { if (assetFolderFor(file.name) !== 'images') throw new Error('Elige una imagen.'); stage(new Uint8Array(await file.arrayBuffer()), file.name); });
}
async function cloud() {
  await run(async () => {
    if (!props.description.trim()) throw new Error('Describe primero lo que quieres ilustrar.');
    const settings = { ...ai.image }; await ai.requireKey(settings.provider); checkWork();
    const prompt = visualPrompt(props.description, props.role, props.profile); controller = new AbortController();
    const media = await generateImage({ ...settings, prompt, aspectRatio: props.role === 'object' || props.role === 'portrait' ? '1:1' : '16:9', signal: controller.signal });
    checkWork();
    const ext = media.mimeType === 'image/jpeg' ? 'jpg' : media.mimeType === 'image/webp' ? 'webp' : 'png';
    stage(media.data, `${props.role}-generado.${ext}`, { provider: `${media.provider} · ${media.model}`, prompt, style_preset: props.profile.style, title: props.description });
  });
}
async function library() {
  await run(async () => { resources.value = (await personalLibrary.load()).resources; });
}
async function chooseLibrary() {
  await run(async () => {
    const resource = entries.value.find(r => r.id === libraryId.value); if (!resource) throw new Error('Elige una imagen de Mis recursos.');
    const data = await personalLibrary.read(resource); checkWork();
    const ext = resource.path.split('.').pop()!;
    const path = await project.addAsset({ name: `${resource.name.replace(/\.[^.]+$/, '')}.${ext}`, data }, { collect: false }); checkWork();
    project.assets.register({ ...resource.provenance, path, title: resource.name, origin: resource.provenance?.origin ?? 'author', status: 'ready', bytes: data.byteLength });
    project.touchAssets(); emit('update:modelValue', path); discard(); message.value = 'Copia independiente preparada en esta obra.';
  });
}
async function accept() {
  await run(async () => {
    const image = candidate.value; if (!image) return;
    const path = image.provenance ? await project.addGeneratedAsset({ name: image.name, data: image.data }, image.provenance) : await project.addAsset({ name: image.name, data: image.data });
    checkWork(); emit('update:modelValue', path); discard(); message.value = 'Imagen preparada. Aplica la composición para colocarla.';
  });
}
async function cutout() { await run(async () => { const image = candidate.value; if (!image) return; const data = await removePlainBackground(image.data, image.mime); stage(data, image.name.replace(/\.[^.]+$/, '-recorte.png'), image.provenance); }); }
</script>

<template>
  <section class="visual-image-picker space-y-3" :data-testid="`visual-picker-${role}`" :aria-label="label">
    <h3 class="font-semibold">{{ label }}</h3>
    <label class="block text-xs">Origen de la imagen
      <select v-model="source" class="dv-select mt-1 w-full" :disabled="busy" :data-testid="`visual-source-${role}`" @change="discard(); source === 'library' && library()">
        <option value="work">Conservar / elegir de esta obra</option><option value="code">Ilustración por código · sin conexión</option><option value="library">Mis recursos</option><option value="upload">Subir imagen propia</option><option value="cloud">Generar con mi clave</option>
      </select>
    </label>
    <select v-if="source === 'work'" :value="modelValue" class="dv-select w-full" :aria-label="`Imagen para ${label}`" :data-testid="`visual-existing-${role}`" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"><option value="">Sin imagen seleccionada</option><option v-for="path in images" :key="path" :value="path">{{ path.split('/').pop() }}</option></select>
    <div v-if="source === 'code'" class="space-y-2"><p class="text-xs text-dv-muted">Plantillas ligeras: habitación, cocina, bosque, retrato y objetos. Interpretación esquemática; el realismo requiere una imagen propia o un generador.</p><button type="button" class="dv-btn-ghost" :disabled="busy" :data-testid="`visual-code-${role}`" @click="code">Preparar dibujo</button></div>
    <div v-if="source === 'library'" class="space-y-2"><input v-model="query" type="search" class="dv-input w-full" aria-label="Buscar imágenes en Mis recursos" placeholder="Nombre o etiquetas…" :data-testid="`visual-library-search-${role}`" /><select v-model="libraryId" class="dv-select w-full" :aria-label="`Recurso para ${label}`" :data-testid="`visual-library-${role}`"><option value="">Selecciona una imagen</option><option v-for="r in entries" :key="r.id" :value="r.id">{{ r.name }}</option></select><button type="button" class="dv-btn-ghost" :disabled="busy || !libraryId" :data-testid="`visual-library-use-${role}`" @click="chooseLibrary">Usar una copia</button><p v-if="!busy && !entries.length" class="text-xs text-dv-muted">No hay imágenes que coincidan. Puedes subir una propia.</p></div>
    <label v-if="source === 'upload'" class="dv-btn-ghost inline-block cursor-pointer">Elegir archivo<input type="file" accept="image/*,.svg" class="sr-only" :disabled="busy" :data-testid="`visual-upload-${role}`" @change="upload" /></label>
    <div v-if="source === 'cloud'" class="space-y-2">
      <p class="text-xs text-dv-muted">{{ CLOUD_USAGE_NOTICE }}</p>
      <label class="block text-xs">Proveedor<select v-model="ai.image.provider" class="dv-select mt-1 w-full" :disabled="busy" :data-testid="`visual-provider-${role}`" @change="ai.selectImage(ai.image.provider)"><option value="gemini">Gemini</option><option value="cloudflare">Cloudflare · cuota gratuita limitada</option></select></label>
      <label class="block text-xs">Modelo<input v-model="ai.image.model" class="dv-input mt-1 w-full" :list="`visual-models-${role}`" :disabled="busy" /><datalist :id="`visual-models-${role}`"><option v-for="model in models" :key="model.id" :value="model.id">{{ model.label }}</option></datalist></label>
      <label v-if="ai.image.provider === 'cloudflare'" class="block text-xs">Identificador de cuenta<input v-model="ai.image.accountId" class="dv-input mt-1 w-full" :disabled="busy" /></label>
      <button type="button" class="dv-btn-ghost" :disabled="busy || !description.trim()" :data-testid="`visual-generate-${role}`" @click="cloud">{{ busy ? 'Generando…' : 'Generar vista previa' }}</button>
      <button v-if="busy && controller" type="button" class="dv-btn-ghost" @click="controller.abort()">Cancelar generación</button>
    </div>
    <div v-if="candidate" class="space-y-2">
      <img :src="candidate.url" :alt="description || label" class="visual-swatch" :data-testid="`visual-candidate-${role}`" />
      <p v-if="role === 'object'" class="text-xs text-dv-muted">El objeto debe quedar aislado. Si trae fondo liso, puedes intentar retirarlo y revisar el resultado.</p>
      <button v-if="role === 'object' && candidate.mime !== 'image/svg+xml'" type="button" class="dv-btn-ghost" :disabled="busy" data-testid="visual-cutout" @click="cutout">Quitar fondo uniforme</button>
      <button type="button" class="dv-btn-accent" :disabled="busy" :data-testid="`visual-accept-${role}`" @click="accept">Usar esta imagen</button><button type="button" class="dv-btn-ghost" :disabled="busy" @click="discard">Descartar</button>
    </div>
    <img v-else-if="modelValue" :src="project.resolveAsset(modelValue)" :alt="description || label" class="visual-swatch" :data-testid="`visual-selected-${role}`" />
    <p v-if="message" role="status" class="text-xs" :data-testid="`visual-message-${role}`">{{ message }}</p><p v-if="error" role="alert" class="text-sm text-dv-danger" :data-testid="`visual-error-${role}`">{{ error }}</p>
  </section>
</template>

<style scoped>
.visual-swatch { display: block; width: 100%; height: 140px; object-fit: contain; border-radius: .4rem; background: repeating-conic-gradient(#7772 0% 25%, transparent 0% 50%) 50% / 16px 16px; }
</style>
