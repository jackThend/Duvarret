<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import type { SpatialAudioEngine } from '@/runtime/audio/SpatialAudioEngine';
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, assetFolderFor, assetUsages } from '@/core/assets/usages';
import { useProjectStore, type AssetAssignment } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import { STUDIO_AUDIO } from '../services/audio';
import { presentAssets } from '../services/assetProbe';
import Modal from './Modal.vue';
import { useAiStore } from '../stores/ai';
import { generateImage, generateSoundEffect, providerFetch } from '../services/ai';
import { searchSoundBank, type BankSound } from '@/core/assets/freesound';
import { AI_PROVIDER_LABELS, CLOUD_USAGE_NOTICE, IMAGE_MODELS, CLOUDFLARE_IMAGE_MODELS } from '@/core/ai/catalog';
import type { GeneratedMedia } from '@/core/ai/types';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const studio = useStudioStore();
const ai = useAiStore();
const audio = inject<SpatialAudioEngine | null>(STUDIO_AUDIO, null);

const ACCEPT = [...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS].map((e) => `.${e}`).join(',');
const dragging = ref(false);
const busy = ref(false);
const message = ref('');
const error = ref('');
const present = ref<Set<string>>(new Set());
const probing = ref(true);
const assigning = ref<string | null>(null);
const confirmRemove = ref<string | null>(null);
const imagePrompt = ref('');
const imageBusy = ref(false);
const imageModels = computed(() => ai.image.provider === 'cloudflare' ? CLOUDFLARE_IMAGE_MODELS : IMAGE_MODELS);
const generatedImage = shallowRef<{ media: GeneratedMedia; url: string; prompt: string; nodeId: string; storage: typeof project.storage } | null>(null);
const bankQuery = ref('');
const bankBusy = ref(false);
const bankSearched = ref(false);
const bankResults = shallowRef<BankSound[]>([]);
const bankListening = ref<number | null>(null);
const effectBusy = ref(false);
const generatedEffect = shallowRef<{ media: GeneratedMedia; url: string; prompt: string; storage: typeof project.storage } | null>(null);
const form = ref({ kind: 'scene_sound' as AssetAssignment['kind'], nodeId: project.selectedNodeId ?? '', characterId: project.characters[0]?.id ?? '', mood: 'neutral', itemId: project.items[0]?.id ?? '', loop: false });

const usages = computed(() => assetUsages(project.manifest));
const known = computed(() => [...project.assetPaths].sort());
const missing = computed(() => known.value.filter((p) => usages.value.has(p) && !present.value.has(p)));
const available = computed(() => known.value.filter((p) => present.value.has(p)));

/** Comprueba qué archivos existen realmente (en disco, en el dispositivo o junto a la obra de ejemplo). */
async function probe() {
  probing.value = true;
  present.value = await presentAssets(known.value, project.resolveAsset, project.assetOverrides);
  probing.value = false;
}

onMounted(() => { void probe(); void ai.initialize(); });
function discardImage() { if (generatedImage.value) URL.revokeObjectURL(generatedImage.value.url); generatedImage.value = null; }
onBeforeUnmount(() => { discardImage(); discardEffect(); player?.pause(); });
async function createImage() {
  error.value = message.value = '';
  const storage = project.storage;
  const nodeId = project.selectedNodeId;
  if (!nodeId) { error.value = 'Crea o selecciona una escena para ilustrarla.'; return; }
  if (!imagePrompt.value.trim()) { error.value = 'Describe la ilustración que quieres crear.'; return; }
  imageBusy.value = true;
  try {
    await ai.requireKey(ai.image.provider);
    const prompt = imagePrompt.value.trim();
    const media = await generateImage({ provider: ai.image.provider, model: ai.image.model, accountId: ai.image.accountId, prompt });
    if (project.storage !== storage) throw new Error('La obra cambió durante la generación. Vuelve a generar para la obra abierta.');
    discardImage();
    generatedImage.value = { media, prompt, nodeId, storage, url: URL.createObjectURL(new Blob([media.data.slice().buffer], { type: media.mimeType })) };
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { imageBusy.value = false; }
}
async function acceptImage() {
  const result = generatedImage.value;
  if (!result) return;
  busy.value = true; error.value = '';
  try {
    if (project.storage !== result.storage || !project.nodes.some(node => node.node_id === result.nodeId)) throw new Error('La escena cambió. Vuelve a generar la ilustración para la obra abierta.');
    const ext = /jpe?g/.test(result.media.mimeType) ? 'jpg' : /webp/.test(result.media.mimeType) ? 'webp' : 'png';
    const path = await project.addGeneratedAsset({ name: `ilustracion-${result.nodeId}-${Date.now()}.${ext}`, data: result.media.data }, { provider: `${result.media.provider} · ${result.media.model}`, prompt: result.prompt });
    project.assignAsset(path, { kind: 'illustration', nodeId: result.nodeId, alt: result.prompt.slice(0, 300) });
    await project.save();
    present.value = new Set([...present.value, path]);
    studio.previewNonce++;
    discardImage(); message.value = 'Ilustración guardada y colocada en la escena. Se incluirá al exportar la obra.';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}

async function upload(files: FileList | File[] | null, replacePath?: string) {
  if (!files?.length) return;
  busy.value = true;
  error.value = '';
  const added: string[] = [];
  const failures: string[] = [];
  for (const file of Array.from(files)) {
    try {
      const path = await project.addAsset({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }, replacePath ? { replacePath } : {});
      audio?.invalidate(path);
      present.value = new Set([...present.value, path]);
      added.push(path);
    } catch (e) {
      failures.push(e instanceof Error ? e.message : `No se pudo añadir «${file.name}».`);
    }
  }
  // Con varios archivos soltados a la vez, cada fallo se nombra (antes solo quedaba el último).
  error.value = failures.join(' ');
  busy.value = false;
  if (added.length) {
    message.value = added.length === 1 ? `Añadido: ${nameOf(added[0]!)}` : `${added.length} recursos añadidos.`;
    studio.previewNonce++;
    if (!replacePath && added.length === 1) openAssign(added[0]!);
  }
}

/** Vacía el selector tras leerlo: así se puede volver a elegir el mismo archivo. */
function pick(event: Event, replacePath?: string) {
  const input = event.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : null;
  input.value = '';
  void upload(files, replacePath);
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  void upload(event.dataTransfer?.files ?? null);
}

function openAssign(path: string) {
  assigning.value = path;
  const isAudio = assetFolderFor(path) === 'audio';
  form.value.kind = isAudio ? 'scene_sound' : project.characters.length ? 'portrait' : 'illustration';
  form.value.nodeId = project.selectedNodeId ?? project.nodes[0]?.node_id ?? '';
}

function assign(path: string) {
  const f = form.value;
  const target: AssetAssignment =
    f.kind === 'portrait' ? { kind: 'portrait', characterId: f.characterId, mood: f.mood.trim() || 'neutral' }
    : f.kind === 'item_icon' ? { kind: 'item_icon', itemId: f.itemId }
    : f.kind === 'ambience' ? { kind: 'ambience' }
    : f.kind === 'illustration' ? { kind: 'illustration', nodeId: f.nodeId }
    : f.kind === 'narration' ? { kind: 'narration', nodeId: f.nodeId }
    : { kind: 'scene_sound', nodeId: f.nodeId, loop: f.loop };
  project.assignAsset(path, target);
  if (target.kind !== 'portrait' && target.kind !== 'item_icon' && target.kind !== 'ambience') project.select(target.nodeId);
  assigning.value = null;
  message.value = target.kind === 'scene_sound' ? 'Sonido colocado delante del oyente: ajústalo arrastrándolo en el radar.' : 'Recurso colocado en la obra.';
}

async function remove(path: string) {
  await project.removeAsset(path);
  present.value = new Set([...present.value].filter((p) => p !== path));
  confirmRemove.value = null;
  studio.previewNonce++;
}

let player: HTMLAudioElement | null = null;
function listen(path: string) {
  player?.pause();
  bankListening.value = null;
  player = new Audio(project.resolveAsset(path));
  void player.play()?.catch(() => undefined);
}

/** Banco libre: solo sonidos CC0 de Freesound, escuchables antes de elegirlos. */
async function searchBank() {
  error.value = message.value = '';
  bankBusy.value = true;
  try {
    await ai.requireKey('freesound');
    bankResults.value = await searchSoundBank(providerFetch('freesound'), bankQuery.value);
    bankSearched.value = true;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { bankBusy.value = false; }
}

function listenBank(sound: BankSound) {
  player?.pause();
  if (bankListening.value === sound.id) { bankListening.value = null; return; }
  bankListening.value = sound.id;
  player = new Audio(sound.previewUrl);
  player.onended = () => { bankListening.value = null; };
  void player.play()?.catch(() => { bankListening.value = null; });
}

async function chooseBank(sound: BankSound) {
  player?.pause();
  busy.value = true; error.value = message.value = '';
  try {
    const path = await project.addBankSound(sound, bankQuery.value.trim());
    audio?.invalidate(path);
    present.value = new Set([...present.value, path]);
    studio.previewNonce++;
    message.value = `«${sound.name}», de ${sound.author}, ya está en la obra (CC0).`;
    openAssign(path);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}

/** Último recurso, de pago: crear el efecto con ElevenLabs, escucharlo y decidir si entra en la obra. */
function discardEffect() { if (generatedEffect.value) URL.revokeObjectURL(generatedEffect.value.url); generatedEffect.value = null; }
async function createEffect() {
  const prompt = bankQuery.value.trim();
  if (!prompt) return;
  error.value = message.value = '';
  effectBusy.value = true;
  try {
    await ai.requireKey('elevenlabs');
    const storage = project.storage;
    const media = await generateSoundEffect({ text: prompt });
    if (project.storage !== storage) throw new Error('La obra cambió durante la creación. Vuelve a crear el sonido para la obra abierta.');
    discardEffect();
    generatedEffect.value = { media, prompt, storage, url: URL.createObjectURL(new Blob([media.data.slice().buffer], { type: media.mimeType })) };
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { effectBusy.value = false; }
}
async function acceptEffect() {
  const effect = generatedEffect.value;
  if (!effect) return;
  busy.value = true; error.value = '';
  try {
    if (project.storage !== effect.storage) throw new Error('La obra cambió. Vuelve a crear el sonido para la obra abierta.');
    const path = await project.addGeneratedAsset({ name: `efecto ${effect.prompt.slice(0, 32)}.mp3`, data: effect.media.data }, { provider: 'elevenlabs · sound-generation', prompt: effect.prompt, title: `Efecto: «${effect.prompt}»` });
    audio?.invalidate(path);
    present.value = new Set([...present.value, path]);
    studio.previewNonce++;
    discardEffect();
    message.value = 'Efecto creado y guardado en la obra.';
    openAssign(path);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}

const seconds = (value: number) => (value < 10 ? value.toFixed(1) : Math.round(value).toString()).replace('.', ',');

const nameOf = (path: string) => path.split('/').pop() ?? path;
const originOf = (path: string) => project.assets.get(path)?.origin;
const creditOf = (path: string) => { const r = project.assets.get(path); return r?.license && r.author ? `${r.license.split(' ')[0]} · ${r.author}` : ''; };
const canRemove = (path: string) => originOf(path) === 'author' && project.assets.get(path)?.status === 'ready';
const sceneOptions = computed(() => project.nodes.map((n) => ({ id: n.node_id, label: n.title ?? n.node_id })));
</script>

<template>
  <Modal title="Recursos de la obra" wide @close="emit('close')">
    <div class="space-y-5 text-sm" data-testid="assets-dialog">
      <section class="space-y-3 rounded border border-dv-border p-4" aria-label="Crear una ilustración" data-testid="image-generation">
        <h3 class="dv-section-title">Crear una ilustración</h3>
        <p class="text-xs text-dv-muted">Para la escena «{{ project.selectedNode?.title ?? 'selecciona una escena' }}». Primero verás el resultado y decidirás si usarlo.</p>
        <label class="block text-xs">Proveedor de imágenes
          <select v-model="ai.image.provider" class="dv-select mt-1 w-full" :disabled="imageBusy" data-testid="image-provider" @change="ai.selectImage(ai.image.provider)"><option value="gemini">Gemini</option><option value="cloudflare">Cloudflare Workers AI · cuota gratuita limitada</option></select>
        </label>
        <label v-if="ai.image.provider === 'cloudflare'" class="block text-xs">Identificador de cuenta de Cloudflare<input v-model="ai.image.accountId" class="dv-input mt-1 w-full" data-testid="image-account" :disabled="imageBusy" /></label>
        <label class="block text-xs">Modelo
          <input v-model="ai.image.model" list="asset-image-models" class="dv-input mt-1 w-full" :disabled="imageBusy" data-testid="image-model" />
        </label>
        <datalist id="asset-image-models"><option v-for="model in imageModels" :key="model.id" :value="model.id">{{ model.label }}</option></datalist>
        <label class="block">Describe la imagen y su estilo
          <textarea v-model="imagePrompt" rows="3" maxlength="8000" class="dv-input mt-1 w-full" data-testid="image-prompt" placeholder="Una biblioteca junto al mar, cómic lofi en tinta índigo y cobre…" :disabled="imageBusy" />
        </label>
        <p class="text-xs text-dv-muted">Se envía esta descripción a {{ AI_PROVIDER_LABELS[ai.image.provider] }}. {{ CLOUD_USAGE_NOTICE }}</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="dv-btn-accent" data-testid="image-generate" :disabled="imageBusy || busy || !imagePrompt.trim() || !project.selectedNodeId" @click="createImage">{{ imageBusy ? 'Creando ilustración…' : 'Generar vista previa' }}</button>
          <button type="button" class="dv-btn-ghost" @click="studio.settingsOpen = true; emit('close')">Configurar mi proveedor</button>
        </div>
        <div v-if="generatedImage" class="space-y-2" data-testid="image-preview">
          <img :src="generatedImage.url" :alt="generatedImage.prompt" class="max-h-80 w-full rounded object-contain" />
          <div class="flex flex-wrap gap-2">
            <button type="button" class="dv-btn-accent" data-testid="image-accept" :disabled="busy || imageBusy" @click="acceptImage">Usar esta ilustración en la escena</button>
            <button type="button" class="dv-btn-ghost" :disabled="busy" @click="discardImage">Descartar vista previa</button>
          </div>
        </div>
      </section>
      <section class="space-y-3 rounded border border-dv-border p-4" aria-label="Buscar un sonido libre" data-testid="sound-bank">
        <h3 class="dv-section-title">Buscar un sonido libre</h3>
        <p class="text-xs text-dv-muted">Sonidos de Freesound con licencia CC0: puedes usarlos en tus obras, también a la venta, sin pedir permiso ni acreditar. Escúchalos antes de elegir.</p>
        <form class="flex flex-wrap gap-2" @submit.prevent="searchBank">
          <input v-model="bankQuery" class="dv-input min-w-0 flex-1" data-testid="bank-query" placeholder="grillos, pasos en madera, campana lejana…" :disabled="bankBusy" aria-label="Qué sonido buscas" />
          <button type="submit" class="dv-btn-accent" data-testid="bank-search" :disabled="bankBusy || !bankQuery.trim()">{{ bankBusy ? 'Buscando…' : 'Buscar' }}</button>
          <button v-if="!ai.configured.freesound" type="button" class="dv-btn-ghost" @click="studio.settingsOpen = true; emit('close')">Conectar Freesound</button>
        </form>
        <p v-if="bankSearched && !bankResults.length" class="text-dv-muted" data-testid="bank-empty">No hay sonidos CC0 para «{{ bankQuery }}». Prueba con otras palabras, mejor en inglés («crickets», «footsteps»).</p>
        <div v-if="ai.configured.elevenlabs && bankQuery.trim() && (bankSearched || !ai.configured.freesound)" class="flex flex-wrap items-center gap-2 text-xs text-dv-muted" data-testid="effect-generation">
          <span>¿No encuentras lo que buscas?</span>
          <button type="button" class="dv-btn-ghost" data-testid="effect-generate" :disabled="effectBusy || busy" @click="createEffect">{{ effectBusy ? 'Creando…' : `Crear «${bankQuery.trim()}» con ElevenLabs` }}</button>
          <span>Gasta créditos de tu cuenta. {{ CLOUD_USAGE_NOTICE }}</span>
        </div>
        <div v-if="generatedEffect" class="space-y-2" data-testid="effect-preview">
          <audio :src="generatedEffect.url" controls class="w-full" />
          <div class="flex flex-wrap gap-2">
            <button type="button" class="dv-btn-accent" data-testid="effect-accept" :disabled="busy" @click="acceptEffect">Usar en la obra</button>
            <button type="button" class="dv-btn-ghost" :disabled="busy" @click="discardEffect">Descartar</button>
          </div>
        </div>
        <ul v-if="bankResults.length" class="space-y-1" data-testid="bank-results">
          <li v-for="sound in bankResults" :key="sound.id" class="flex items-center gap-3 border-b border-dv-border py-1.5" :data-testid="`bank-${sound.id}`">
            <button type="button" class="dv-icon-btn shrink-0 border border-dv-border" :aria-label="`${bankListening === sound.id ? 'Detener' : 'Escuchar'} ${sound.name}`" :aria-pressed="bankListening === sound.id" data-testid="bank-listen" @click="listenBank(sound)">{{ bankListening === sound.id ? '■' : '▶' }}</button>
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ sound.name }}</span>
              <span class="block truncate text-xs text-dv-muted">{{ sound.author }} · {{ seconds(sound.seconds) }} s · <span data-testid="bank-license">{{ sound.license }}</span></span>
            </span>
            <button type="button" class="dv-btn-ghost shrink-0" data-testid="bank-choose" :disabled="busy" @click="chooseBank(sound)">Usar en la obra</button>
          </li>
        </ul>
      </section>
      <label
        class="dv-dropzone"
        :class="{ 'is-dragging': dragging }"
        data-testid="asset-dropzone"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <span class="font-prose text-base">Arrastra aquí tus sonidos e imágenes</span>
        <span class="text-xs text-dv-muted">o haz clic para elegirlos · voces, efectos, música, retratos, ilustraciones (hasta 50 MB cada uno)</span>
        <input type="file" multiple :accept="ACCEPT" class="sr-only" data-testid="asset-input" @change="pick($event)" />
      </label>
      <p v-if="busy" class="text-dv-muted">Guardando…</p>
      <p v-if="message" role="status" data-testid="assets-message">{{ message }}</p>
      <p v-if="error" role="alert" class="text-dv-danger" data-testid="assets-error">{{ error }}</p>

      <section v-if="missing.length" aria-label="Recursos que faltan" data-testid="assets-missing">
        <h3 class="dv-section-title">Faltan en la obra ({{ missing.length }})</h3>
        <p class="mb-2 text-xs text-dv-muted">Hasta que los aportes, sonarán como un tono de prueba o se verán como un marcador.</p>
        <ul class="space-y-1">
          <li v-for="path in missing" :key="path" class="flex items-center justify-between gap-3 border-b border-dv-border py-1.5" :data-testid="`missing-${nameOf(path)}`">
            <span class="min-w-0">
              <span class="block truncate">{{ nameOf(path) }}</span>
              <span class="block truncate text-xs text-dv-muted">{{ usages.get(path)?.join(' · ') }}</span>
            </span>
            <label class="dv-btn-ghost shrink-0 cursor-pointer">
              Aportar archivo
              <input type="file" :accept="ACCEPT" class="sr-only" data-testid="provide-input" @change="pick($event, path)" />
            </label>
          </li>
        </ul>
      </section>

      <section aria-label="Recursos disponibles" data-testid="assets-available">
        <h3 class="dv-section-title">Recursos ({{ available.length }})</h3>
        <p v-if="probing" class="text-dv-muted">Buscando archivos…</p>
        <p v-else-if="!available.length" class="text-dv-muted">Todavía no hay recursos. Arrastra tus archivos arriba.</p>
        <ul class="grid gap-2 md:grid-cols-2">
          <li v-for="path in available" :key="path" class="dv-pitch !p-3" :data-testid="`asset-${nameOf(path)}`">
            <div class="flex items-start gap-3">
              <img v-if="assetFolderFor(path) === 'images'" :src="project.resolveAsset(path)" alt="" class="h-12 w-12 shrink-0 rounded object-cover" />
              <button v-else type="button" class="dv-icon-btn shrink-0 border border-dv-border" :aria-label="`Escuchar ${nameOf(path)}`" @click="listen(path)">▶</button>
              <div class="min-w-0 flex-1">
                <p class="truncate">{{ nameOf(path) }}
                  <span v-if="creditOf(path)" class="ml-1 text-xs text-dv-accent-2" data-testid="asset-credit">{{ creditOf(path) }}</span>
                  <span v-else-if="originOf(path) === 'author'" class="ml-1 text-xs text-dv-accent-2">tuyo</span>
                  <span v-else-if="originOf(path) === 'synthetic'" class="ml-1 text-xs text-dv-mystic">sintético</span>
                </p>
                <p class="text-xs text-dv-muted" data-testid="asset-usages">{{ usages.get(path)?.join(' · ') || 'Aún no se usa en la obra' }}</p>
              </div>
            </div>
            <div v-if="assigning === path" class="mt-3 space-y-2" data-testid="assign-form">
              <select v-model="form.kind" class="dv-select w-full" aria-label="Dónde colocarlo" data-testid="assign-kind">
                <template v-if="assetFolderFor(path) === 'audio'">
                  <option value="scene_sound">Sonido en una escena</option>
                  <option value="narration">Narración de una escena (sin pantalla)</option>
                  <option value="ambience">Ambiente de fondo de toda la obra</option>
                </template>
                <template v-else>
                  <option v-if="project.characters.length" value="portrait">Retrato de un personaje</option>
                  <option value="illustration">Ilustración de una escena</option>
                  <option v-if="project.items.length" value="item_icon">Icono de un objeto</option>
                </template>
              </select>
              <select v-if="['scene_sound', 'narration', 'illustration'].includes(form.kind)" v-model="form.nodeId" class="dv-select w-full" aria-label="Escena" data-testid="assign-node">
                <option v-for="s in sceneOptions" :key="s.id" :value="s.id">{{ s.label }}</option>
              </select>
              <template v-if="form.kind === 'portrait'">
                <select v-model="form.characterId" class="dv-select w-full" aria-label="Personaje" data-testid="assign-character">
                  <option v-for="c in project.characters" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <input v-model="form.mood" class="dv-input w-full" placeholder="Estado de ánimo (p. ej. alarmado)" aria-label="Estado de ánimo" data-testid="assign-mood" />
              </template>
              <select v-if="form.kind === 'item_icon'" v-model="form.itemId" class="dv-select w-full" aria-label="Objeto">
                <option v-for="i in project.items" :key="i.id" :value="i.id">{{ i.name }}</option>
              </select>
              <label v-if="form.kind === 'scene_sound'" class="flex items-center gap-2 text-xs"><input v-model="form.loop" type="checkbox" /> Repetir en bucle mientras dure la escena</label>
              <div class="flex gap-2">
                <button type="button" class="dv-btn-accent" data-testid="assign-confirm" @click="assign(path)">Colocar</button>
                <button type="button" class="dv-btn-ghost" @click="assigning = null">Cancelar</button>
              </div>
            </div>
            <div v-else class="mt-2 flex gap-3 text-xs">
              <button type="button" class="dv-link !opacity-80" data-testid="assign-open" @click="openAssign(path)">Colocar en la obra…</button>
              <template v-if="canRemove(path)">
                <button v-if="confirmRemove !== path" type="button" class="dv-link !opacity-70" data-testid="asset-remove" @click="confirmRemove = path">Quitar</button>
                <span v-else class="flex gap-2" role="alert">
                  {{ usages.get(path)?.length ? 'Se usa en la obra; sonará un tono de prueba.' : '¿Quitarlo?' }}
                  <button type="button" class="font-semibold text-dv-danger" data-testid="asset-remove-confirm" @click="remove(path)">Quitar</button>
                  <button type="button" @click="confirmRemove = null">Cancelar</button>
                </span>
              </template>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </Modal>
</template>
