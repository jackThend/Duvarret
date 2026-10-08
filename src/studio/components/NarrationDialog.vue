<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue';
import type { SpatialAudioEngine } from '@/runtime/audio/SpatialAudioEngine';
import { AUDIO_EXTENSIONS } from '@/core/assets/usages';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import { STUDIO_AUDIO } from '../services/audio';
import { canRecord, startRecording, type ActiveRecording } from '../services/recorder';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const studio = useStudioStore();
const audio = inject<SpatialAudioEngine | null>(STUDIO_AUDIO, null);

const ACCEPT = AUDIO_EXTENSIONS.map((e) => `.${e}`).join(',');
const recordable = canRecord();
const nodeId = ref(project.selectedNodeId ?? project.nodes[0]?.node_id ?? '');
const recording = ref<ActiveRecording | null>(null);
const elapsed = ref(0);
const busy = ref(false);
const message = ref('');
const error = ref('');
let timer: ReturnType<typeof setInterval> | undefined;
let player: HTMLAudioElement | null = null;

const node = computed(() => project.nodes.find((n) => n.node_id === nodeId.value) ?? null);
const narrationOf = (id: string) => project.nodes.find((n) => n.node_id === id)?.screenless_mode?.voice_over_asset;
const narrated = computed(() => project.nodes.filter((n) => n.screenless_mode?.voice_over_asset).length);
const current = computed(() => (node.value ? narrationOf(node.value.node_id) : undefined));
const script = computed(() => node.value?.screenless_mode?.narration_text ?? node.value?.text_payload ?? '');
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
  if (!current.value) return;
  player?.pause();
  player = new Audio(project.resolveAsset(current.value));
  void player.play()?.catch(() => undefined);
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
  <Modal title="Narración grabada" wide @close="close">
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
          Sin grabación, el modo sin pantalla lee la escena con la voz del sistema. Lee el texto con calma; los silencios del principio y del final se recortan solos.
        </p>
        <h3 class="font-prose text-lg">{{ node.title ?? node.node_id }}</h3>
        <div class="max-h-[35vh] overflow-y-auto whitespace-pre-line rounded border border-dv-border bg-dv-panel-2 p-4 font-prose text-base leading-relaxed" data-testid="narration-text">{{ script }}</div>

        <p v-if="current" class="text-xs" data-testid="narration-current">
          Grabación actual: {{ current.split('/').pop() }}
          <span v-if="missing(current)" class="text-dv-danger">· no se encuentra el archivo</span>
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <template v-if="recording">
            <button type="button" class="dv-btn-accent" data-testid="narration-stop" @click="stop">■ Detener y guardar</button>
            <span class="tabular-nums text-dv-danger" role="timer" aria-live="off" data-testid="narration-clock">● {{ clock }}</span>
            <button type="button" class="dv-btn-ghost" @click="cancel">Descartar</button>
          </template>
          <template v-else>
            <button type="button" class="dv-btn-accent" :disabled="!recordable || busy" data-testid="narration-record" @click="record">● {{ current ? 'Volver a grabar' : 'Grabar' }}</button>
            <button v-if="current" type="button" class="dv-btn-ghost" data-testid="narration-listen" @click="listen">▶ Escuchar</button>
            <label class="dv-btn-ghost cursor-pointer">
              Importar archivo…
              <input type="file" :accept="ACCEPT" class="sr-only" data-testid="narration-import" :disabled="busy" @change="importFile(($event.target as HTMLInputElement).files); ($event.target as HTMLInputElement).value = ''" />
            </label>
            <button v-if="current" type="button" class="dv-link !opacity-70" data-testid="narration-remove" @click="removeNarration">Quitar</button>
          </template>
        </div>
        <p v-if="!recordable" class="text-xs text-dv-muted">Este navegador no permite grabar: importa un archivo grabado con otro programa.</p>
        <p v-if="busy" class="text-dv-muted">Guardando…</p>
        <p v-if="message" role="status" data-testid="narration-message">{{ message }}</p>
        <p v-if="error" role="alert" class="text-dv-danger" data-testid="narration-error">{{ error }}</p>
        <button v-if="nextPending && !recording" type="button" class="dv-link" data-testid="narration-next" @click="choose(nextPending.node_id)">
          Siguiente escena sin grabar: {{ nextPending.title ?? nextPending.node_id }} →
        </button>
      </section>
    </div>
  </Modal>
</template>
