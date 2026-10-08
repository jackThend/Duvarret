<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import type { SpatialAudioEngine } from '@/runtime/audio/SpatialAudioEngine';
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, assetFolderFor, assetUsages } from '@/core/assets/usages';
import { useProjectStore, type AssetAssignment } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import { STUDIO_AUDIO } from '../services/audio';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const studio = useStudioStore();
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
const form = ref({ kind: 'scene_sound' as AssetAssignment['kind'], nodeId: project.selectedNodeId ?? '', characterId: project.characters[0]?.id ?? '', mood: 'neutral', itemId: project.items[0]?.id ?? '', loop: false });

const usages = computed(() => assetUsages(project.manifest));
const known = computed(() => [...project.assetPaths].sort());
const missing = computed(() => known.value.filter((p) => usages.value.has(p) && !present.value.has(p)));
const available = computed(() => known.value.filter((p) => present.value.has(p)));

/** Comprueba qué archivos existen realmente (en disco, en el dispositivo o junto a la obra de ejemplo). */
async function probe() {
  probing.value = true;
  const found = new Set<string>();
  await Promise.all(
    known.value.map(async (path) => {
      if (project.assetOverrides.has(path)) return void found.add(path);
      try {
        const response = await fetch(project.resolveAsset(path));
        // Muchos servidores responden con la página principal (HTML) a cualquier archivo inexistente.
        if (response.ok && !(response.headers.get('content-type') ?? '').includes('text/html')) found.add(path);
      } catch {
        /* no está */
      }
    }),
  );
  present.value = found;
  probing.value = false;
}

onMounted(probe);

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
  player = new Audio(project.resolveAsset(path));
  void player.play()?.catch(() => undefined);
}

const nameOf = (path: string) => path.split('/').pop() ?? path;
const originOf = (path: string) => project.assets.get(path)?.origin;
const canRemove = (path: string) => originOf(path) === 'author' && project.assets.get(path)?.status === 'ready';
const sceneOptions = computed(() => project.nodes.map((n) => ({ id: n.node_id, label: n.title ?? n.node_id })));
</script>

<template>
  <Modal title="Recursos de la obra" wide @close="emit('close')">
    <div class="space-y-5 text-sm" data-testid="assets-dialog">
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
                  <span v-if="originOf(path) === 'author'" class="ml-1 text-xs text-dv-accent-2">tuyo</span>
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
