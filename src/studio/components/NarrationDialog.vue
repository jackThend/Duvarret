<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import type { SpatialAudioEngine } from '@/runtime/audio/SpatialAudioEngine';
import { AUDIO_EXTENSIONS } from '@/core/assets/usages';
import { missingSpeech, speechKey } from '@/core/narration/script';
import type { Delivery, NarrationSelection } from '@/core/narration/plan';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import { STUDIO_AUDIO } from '../services/audio';
import { canRecord, startRecording, type ActiveRecording } from '../services/recorder';
import { narrationStatus, type NarrationStatus } from '../services/narration';
import Modal from './Modal.vue';
import { useAiStore } from '../stores/ai';
import { AI_PROVIDER_LABELS, CLOUD_USAGE_NOTICE, SPEECH_MODELS } from '@/core/ai/catalog';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const studio = useStudioStore();
const ai = useAiStore();
const audio = inject<SpatialAudioEngine | null>(STUDIO_AUDIO, null);

const ACCEPT = AUDIO_EXTENSIONS.map((e) => `.${e}`).join(',');
const recordable = canRecord();
const nodeId = ref(project.selectedNodeId ?? project.nodes[0]?.node_id ?? '');
const recording = ref<ActiveRecording | null>(null);
const elapsed = ref(0);
const busy = ref(false);
const message = ref('');
const error = ref('');
const errorDetails = ref('');
let timer: ReturnType<typeof setInterval> | undefined;
let player: HTMLAudioElement | null = null;

const node = computed(() => project.nodes.find((n) => n.node_id === nodeId.value) ?? null);
const narrationOf = (id: string) => project.nodes.find((n) => n.node_id === id)?.screenless_mode?.voice_over_asset;
const narrated = computed(() => project.nodes.filter((n) => n.screenless_mode?.voice_over_asset).length);
const current = computed(() => (node.value ? narrationOf(node.value.node_id) : undefined));
const voice = computed(() => project.manifest.global_settings.narration_voice);
const selection = ref<NarrationSelection>(voice.value ? { provider: voice.value.provider ?? 'kokoro', model: voice.value.model, voice: voice.value.voice ?? voice.value.voice_id.slice('kokoro:'.length), speed: voice.value.speed } : { ...ai.speech });
const cloud = computed(() => selection.value.provider !== 'kokoro');
const speechModels = computed(() => selection.value.provider === 'kokoro' ? [] : SPEECH_MODELS[selection.value.provider]);
function selectProvider() {
  ai.selectSpeech(selection.value.provider);
  selection.value = { ...ai.speech };
  error.value = message.value = '';
}
watch(selection, value => { ai.speech = { provider: value.provider, model: value.model, voice: value.voice }; }, { deep: true });
const delivery = ref<Delivery>(project.manifest.global_settings.narration_voice?.delivery ?? 'natural');
watch(() => voice.value?.delivery, value => { delivery.value = value ?? 'natural'; });
const localVoice = computed(() => project.storage.kind === 'tauri' && selection.value.provider === 'kokoro');
const localStatus = ref<NarrationStatus | null>(null);
const checkingVoice = ref(false);
async function checkVoice() {
  checkingVoice.value = true;
  try {
    localStatus.value = await narrationStatus();
  } catch {
    localStatus.value = { ready: false, message: 'No se pudo comprobar la voz incluida. Cierra y vuelve a abrir Duvarret; si sigue ocurriendo, ejecuta el instalador para repararla. Tus obras se conservan.' };
  } finally {
    checkingVoice.value = false;
  }
}
watch(localVoice, value => { if (value) void checkVoice(); }, { immediate: true });
const pendingVoice = computed(() => missingSpeech(project.manifest).length);
const script = computed(() => node.value?.screenless_mode?.narration_text ?? node.value?.text_payload ?? '');
const currentReady = computed(() => !voice.value || voice.value.clips.some(clip => speechKey(clip.text) === speechKey(script.value) && clip.asset === current.value));
const nextPending = computed(() => {
  const nodes = project.nodes;
  const from = nodes.findIndex((n) => n.node_id === nodeId.value);
  return [...nodes.slice(from + 1), ...nodes.slice(0, from)].find((n) => !n.screenless_mode?.voice_over_asset) ?? null;
});
const clock = computed(() => `${Math.floor(elapsed.value / 60)}:${String(elapsed.value % 60).padStart(2, '0')}`);
const missing = (path: string) => project.assets.get(path)?.status === 'missing';

function choose(id: string) {
  if (recording.value) return;
  nodeId.value = id;
  message.value = error.value = '';
}

async function record() {
  error.value = message.value = '';
  try {
    player?.pause();
    recording.value = await startRecording();
    elapsed.value = 0;
    timer = setInterval(() => elapsed.value++, 1000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo empezar a grabar.';
  }
}

function stopTimer() {
  clearInterval(timer);
  timer = undefined;
}

async function stop() {
  const active = recording.value;
  if (!active) return;
  stopTimer();
  recording.value = null;
  busy.value = true;
  try {
    const { data, seconds } = await active.stop();
    await save({ name: `narracion_${nodeId.value}.wav`, data });
    message.value = `Narración guardada (${seconds.toFixed(1)} s).`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar la grabación.';
  } finally {
    busy.value = false;
  }
}

function cancel() {
  stopTimer();
  recording.value?.cancel();
  recording.value = null;
}

/** Guarda el archivo (sustituyendo la grabación propia anterior) y lo asigna a la escena. */
async function save(file: { name: string; data: Uint8Array }) {
  const id = nodeId.value;
  const previous = narrationOf(id);
  const own = previous && project.assets.get(previous)?.origin === 'author';
  const path = await project.addAsset(file, own ? { replacePath: previous } : {});
  project.assignAsset(path, { kind: 'narration', nodeId: id });
  audio?.invalidate(path);
  studio.previewNonce++;
}

async function importFile(files: FileList | null) {
  const file = files?.[0];
  if (!file) return;
  error.value = message.value = '';
  busy.value = true;
  try {
    await save({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    message.value = `Narración importada: ${file.name}`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : `No se pudo importar «${file.name}».`;
  } finally {
    busy.value = false;
  }
}

function listen() {
  if (!current.value || !currentReady.value) return;
  player?.pause();
  player = new Audio(project.resolveAsset(current.value));
  void player.play()?.catch(() => { error.value = 'No se pudo reproducir la grabación. Comprueba que el archivo sigue en la obra y vuelve a actualizar la voz.'; });
}

async function updateVoice() {
  if (!cloud.value && (!localStatus.value?.ready || checkingVoice.value)) return;
  error.value = message.value = '';
  errorDetails.value = '';
  player?.pause();
  audio?.stop('duvarret::speech', 0);
  try {
    const chosen = { ...selection.value, ...(cloud.value ? {} : { voice: 'ef_dora', speed: undefined }) };
    const result = await project.updateNarration(delivery.value, chosen);
    for (const clip of project.manifest.global_settings.narration_voice?.clips ?? []) audio?.invalidate(clip.asset);
    studio.previewNonce++;
    message.value = result.pending
      ? `Voz guardada. Hay ${result.pending} frases nuevas por actualizar porque el texto cambió durante la generación.`
      : `Voz actualizada y guardada. ${result.generated} ${result.generated === 1 ? 'frase nueva' : 'frases nuevas'}; ya puedes escuchar y exportar.`;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    error.value = /Traceback|python|kokoro|onnx|No se encuentra el motor|No se pudo iniciar/i.test(detail)
      ? 'No se pudo preparar la voz de IA en este equipo. Tus textos y grabaciones anteriores se conservan. Puedes reintentar cuando el motor local esté disponible.'
      : detail;
    if (error.value !== detail) errorDetails.value = detail;
  }
}

function removeNarration() {
  project.patchNode(nodeId.value, { screenless_mode: { voice_over_asset: undefined } });
  studio.previewNonce++;
  message.value = 'La escena vuelve a narrarse con la voz del sistema.';
}

/** Cerrar en plena grabación guarda la toma en vez de perderla (Esc o clic fuera del diálogo). */
async function close() {
  if (recording.value) await stop();
  emit('close');
}

onBeforeUnmount(() => {
  cancel();
  player?.pause();
});
</script>

<template>
  <Modal title="Narración y voz" wide @close="close">
    <div class="grid gap-5 text-sm md:grid-cols-[minmax(0,15rem)_1fr]" data-testid="narration-dialog">
      <nav aria-label="Escenas">
        <p class="mb-2 text-xs text-dv-muted" data-testid="narration-coverage">{{ narrated }} de {{ project.nodes.length }} escenas con voz grabada</p>
        <ul class="max-h-[55vh] space-y-0.5 overflow-y-auto">
          <li v-for="n in project.nodes" :key="n.node_id">
            <button
              type="button"
              class="dv-tree-item w-full text-left"
              :class="{ 'is-active': n.node_id === nodeId }"
              :aria-current="n.node_id === nodeId ? 'true' : undefined"
              :disabled="!!recording && n.node_id !== nodeId"
              :data-testid="`narration-scene-${n.node_id}`"
              @click="choose(n.node_id)"
            >
              <span aria-hidden="true">{{ n.screenless_mode?.voice_over_asset ? '●' : '○' }}</span>
              <span class="truncate">{{ n.title ?? n.node_id }}</span>
              <span class="sr-only">{{ n.screenless_mode?.voice_over_asset ? '(grabada)' : '(sin grabar)' }}</span>
            </button>
          </li>
        </ul>
      </nav>

      <section v-if="node" class="min-w-0 space-y-3" :aria-label="`Narración de ${node.title ?? node.node_id}`">
        <p class="text-xs text-dv-muted">
          <template v-if="voice">Voz de la obra: {{ voice.label }}. Se mantiene en títulos, narración, opciones y avisos.</template>
          <template v-else>Sin grabación, el modo sin pantalla lee la escena con la voz del sistema. Lee el texto con calma; los silencios del principio y del final se recortan solos.</template>
        </p>
        <p v-if="pendingVoice" role="alert" class="text-sm text-dv-danger" data-testid="narration-pending">Hay {{ pendingVoice }} frases por actualizar con la voz de la obra. Puedes seguir editando; actualiza las grabaciones antes de publicar.</p>
        <div class="space-y-3 rounded border border-dv-border bg-dv-panel-2 p-4" data-testid="narration-local">
          <label class="block">Voz de la obra
            <select v-model="selection.provider" class="dv-select mt-1 w-full" :disabled="project.narrationBusy" data-testid="narration-provider" @change="selectProvider">
              <option value="kokoro">Dora · voz natural local incluida</option>
              <option v-for="provider in (['gemini','elevenlabs','openai','compatible'] as const)" :key="provider" :value="provider">{{ AI_PROVIDER_LABELS[provider] }} · nube con tu clave</option>
            </select>
          </label>
          <template v-if="!cloud">
            <p class="text-xs text-dv-muted">Funciona sin internet. El texto se procesa en tu equipo y no se envía a ningún servicio.</p>
            <p v-if="localVoice" role="status" :class="{ 'text-dv-danger': localStatus && !localStatus.ready }" data-testid="narration-engine-status">{{ checkingVoice ? 'Comprobando la voz incluida…' : localStatus?.message }}</p>
            <p v-else class="text-xs text-dv-muted">La voz incluida se genera desde la aplicación de escritorio.</p>
            <button v-if="localStatus && !localStatus.ready" type="button" class="dv-link" :disabled="checkingVoice" data-testid="narration-check-engine" @click="checkVoice">Volver a comprobar</button>
          </template>
          <div v-else class="space-y-2">
            <label class="block text-xs">Modelo de voz<input v-model="selection.model" list="narration-cloud-models" class="dv-input mt-1 w-full" :disabled="project.narrationBusy" data-testid="narration-model" /></label>
            <datalist id="narration-cloud-models"><option v-for="model in speechModels" :key="model.id" :value="model.id">{{ model.label }}</option></datalist>
            <label class="block text-xs">{{ selection.provider === 'elevenlabs' ? 'Identificador de voz de tu cuenta' : 'Nombre o identificador de voz' }}<input v-model="selection.voice" class="dv-input mt-1 w-full" :disabled="project.narrationBusy" data-testid="narration-cloud-voice" /></label>
            <p class="text-xs text-dv-muted">Se enviarán los textos del relato, títulos y opciones al proveedor para grabarlos con la misma voz. {{ CLOUD_USAGE_NOTICE }}</p>
            <button type="button" class="dv-link" @click="studio.settingsOpen = true; emit('close')">Configurar mi proveedor</button>
          </div>
          <label v-if="!cloud" class="flex flex-wrap items-center gap-3">
            <span>Interpretación</span>
            <select v-model="delivery" class="dv-select" :disabled="project.narrationBusy" data-testid="narration-delivery">
              <option value="natural">Natural</option>
              <option value="sweet">Dulce y pausada</option>
            </select>
          </label>
          <p class="text-xs text-dv-muted">La misma voz en títulos, relato y opciones, sin eco añadido. Se reutilizan las frases ya grabadas. Cambiar de modelo o voz vuelve a grabar el conjunto.</p>
          <button type="button" class="dv-btn-accent" :disabled="project.narrationBusy || busy || !!recording || (!cloud && (checkingVoice || !localVoice || !localStatus?.ready)) || (cloud && (!selection.model?.trim() || !selection.voice?.trim()))" data-testid="narration-update" @click="updateVoice">
            {{ project.narrationBusy ? 'Actualizando voz…' : 'Actualizar voz' }}
          </button>
          <p v-if="project.narrationBusy" role="status" data-testid="narration-progress">
            {{ project.narrationProgress.total ? `Frase ${project.narrationProgress.completed} de ${project.narrationProgress.total}` : cloud ? 'Preparando la voz en la nube…' : 'Preparando la voz local…' }}
          </p>
        </div>
        <h3 class="font-prose text-lg">{{ node.title ?? node.node_id }}</h3>
        <div class="max-h-[35vh] overflow-y-auto whitespace-pre-line rounded border border-dv-border bg-dv-panel-2 p-4 font-prose text-base leading-relaxed" data-testid="narration-text">{{ script }}</div>

        <p v-if="current" class="text-xs" data-testid="narration-current">{{ currentReady ? 'Esta escena tiene una grabación preparada.' : 'El texto cambió. Actualiza la voz para escuchar esta versión.' }}<span v-if="missing(current)" class="text-dv-danger"> No se encuentra el archivo.</span></p>
        <details v-if="current" class="text-xs text-dv-muted"><summary>Detalles de la grabación</summary><p class="break-all">{{ current }}</p></details>

        <div class="flex flex-wrap items-center gap-2">
          <template v-if="recording">
            <button type="button" class="dv-btn-accent" data-testid="narration-stop" @click="stop">■ Detener y guardar</button>
            <span class="tabular-nums text-dv-danger" role="timer" aria-live="off" data-testid="narration-clock">● {{ clock }}</span>
            <button type="button" class="dv-btn-ghost" @click="cancel">Descartar</button>
          </template>
          <template v-else>
            <button v-if="!voice" type="button" class="dv-btn-accent" :disabled="!recordable || busy" data-testid="narration-record" @click="record">● {{ current ? 'Volver a grabar' : 'Grabar' }}</button>
            <button v-if="current" type="button" class="dv-btn-ghost" :disabled="!currentReady || missing(current)" data-testid="narration-listen" @click="listen">▶ Escuchar</button>
            <label v-if="!voice" class="dv-btn-ghost cursor-pointer">
              Importar archivo…
              <input type="file" :accept="ACCEPT" class="sr-only" data-testid="narration-import" :disabled="busy" @change="importFile(($event.target as HTMLInputElement).files); ($event.target as HTMLInputElement).value = ''" />
            </label>
            <button v-if="current && !voice" type="button" class="dv-link !opacity-70" data-testid="narration-remove" @click="removeNarration">Quitar</button>
          </template>
        </div>
        <p v-if="voice" class="text-xs text-dv-muted">Actualiza el conjunto de grabaciones con la voz elegida después de editar el texto; así todos los pasajes conservan el mismo narrador.</p>
        <p v-else-if="!recordable" class="text-xs text-dv-muted">Este navegador no permite grabar: importa un archivo grabado con otro programa.</p>
        <p v-if="busy" class="text-dv-muted">Guardando…</p>
        <p v-if="message" role="status" data-testid="narration-message">{{ message }}</p>
        <p v-if="error" role="alert" class="text-dv-danger" data-testid="narration-error">{{ error }}</p>
        <details v-if="errorDetails" class="text-xs text-dv-muted"><summary>Detalles para resolver el problema</summary><pre class="whitespace-pre-wrap break-all">{{ errorDetails }}</pre></details>
        <button v-if="nextPending && !recording" type="button" class="dv-link" data-testid="narration-next" @click="choose(nextPending.node_id)">
          Siguiente escena sin grabar: {{ nextPending.title ?? nextPending.node_id }} →
        </button>
      </section>
    </div>
  </Modal>
</template>
