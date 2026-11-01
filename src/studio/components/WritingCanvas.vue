<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { LAYOUT_LABELS, MODULE_LABELS, TEXT_MARKER, markerName, parseTextMarkers, stripTextMarkers } from '@/core/manifest';
import { assetFolderFor } from '@/core/assets/usages';
import { describePosition } from '@/runtime/audio/coordinates';
import { useProjectStore } from '../stores/project';

const project = useProjectStore();
const textarea = ref<HTMLTextAreaElement | null>(null);
let lastEdit = 0;
let analysisTimer: ReturnType<typeof setTimeout> | undefined;

const node = computed(() => project.selectedNode);
const wordCount = computed(() => (node.value ? stripTextMarkers(node.value.text_payload).trim().split(/\s+/).filter(Boolean).length : 0));
const issues = computed(() => (node.value ? (project.continuity[node.value.node_id] ?? []) : []));

/** Marcadores fantasma: pequeñas marcas doradas que señalan efectos y sonidos sin ensuciar la prosa. */
const markers = computed(() => {
  const n = node.value;
  if (!n) return [];
  const out: { icon: string; label: string }[] = [];
  const te = n.typographic_engine;
  if (te && te.layout_mode !== 'standard') out.push({ icon: '🌀', label: LAYOUT_LABELS[te.layout_mode] });
  if (te?.heartbeat_sync?.enabled && te.layout_mode !== 'heartbeat_tremor') out.push({ icon: '♥', label: `${LAYOUT_LABELS.heartbeat_tremor} · ${te.heartbeat_sync.bpm} latidos` });
  if (te?.flashlight_reveal?.enabled && te.layout_mode !== 'flashlight_mask') out.push({ icon: '🔦', label: LAYOUT_LABELS.flashlight_mask });
  if (te?.flicker_effect) out.push({ icon: '✧', label: 'Parpadeo' });
  for (const e of n.acoustic_events) out.push({ icon: '🎧', label: `${e.label ?? e.event_id} · ${describePosition(e.coordinates)}` });
  if (n.visual_novel_overlay?.enabled) out.push({ icon: '🎭', label: 'Diálogo escenificado' });
  if (n.gameplay_overlay) out.push({ icon: '🕹️', label: MODULE_LABELS[n.gameplay_overlay.type] });
  return out;
});

/**
 * Segmentos del texto con los fragmentos a resaltar: continuidad (subrayado) y marcas de sonido
 * `⟦…⟧`, que el fondo pinta como una ficha bajo el texto para que nunca parezcan prosa.
 */
const segments = computed(() => {
  const text = node.value?.text_payload ?? '';
  const ranges = [
    ...issues.value.filter((i) => i.range).map((i) => ({ ...i.range!, kind: 'continuity' as const })),
    ...[...text.matchAll(TEXT_MARKER)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, kind: 'sound' as const })),
  ].sort((a, b) => a.start - b.start);
  const out: { text: string; mark: 'continuity' | 'sound' | null }[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue;
    out.push({ text: text.slice(cursor, r.start), mark: null }, { text: text.slice(r.start, r.end), mark: r.kind });
    cursor = r.end;
  }
  out.push({ text: `${text.slice(cursor)}\n`, mark: null });
  return out;
});

/** Marcas de sonido del texto, con el sonido que tienen atado (si lo tienen). */
const soundMarkers = computed(() => {
  const n = node.value;
  if (!n) return [];
  const names = [...new Set(parseTextMarkers(n.text_payload).markers.map((m) => m.name))];
  return names.map((name) => ({ name, event: n.acoustic_events.find((e) => e.trigger === 'on_text_marker' && e.trigger_marker === name) }));
});
const audioAssets = computed(() => [...project.assetPaths].filter((p) => assetFolderFor(p) === 'audio').sort());
const editingMarker = ref<string | null>(null);
const markerForm = ref({ asset: '', seconds: 0 });

function openMarker(name: string) {
  const event = soundMarkers.value.find((m) => m.name === name)?.event;
  markerForm.value = { asset: event?.asset ?? audioAssets.value[0] ?? '', seconds: (event?.delay_ms ?? 0) / 1000 };
  editingMarker.value = name;
}

function saveMarker() {
  const n = node.value;
  if (!n || !editingMarker.value || !markerForm.value.asset) return;
  project.setMarkerSound(n.node_id, editingMarker.value, markerForm.value.asset, (Number(markerForm.value.seconds) || 0) * 1000);
  editingMarker.value = null;
}

/** Inserta una marca tras la palabra seleccionada (o en el cursor) y abre su ficha para elegir el sonido. */
function insertMarker() {
  const el = textarea.value;
  const n = node.value;
  if (!el || !n) return;
  const text = n.text_payload;
  const end = el.selectionEnd ?? text.length;
  const taken = new Set(parseTextMarkers(text).markers.map((m) => m.name));
  let name = markerName(text.slice(el.selectionStart ?? end, end)) || 'sonido';
  for (let i = 2; taken.has(name); i++) name = `${name.replace(/ \d+$/, '')} ${i}`;
  project.patchNode(n.node_id, { text_payload: `${text.slice(0, end)}⟦${name}⟧${text.slice(end)}` }, { undoable: true });
  void nextTick(autosize);
  openMarker(name);
}

function autosize() {
  const el = textarea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function scheduleAnalysis() {
  if (analysisTimer) clearTimeout(analysisTimer);
  const id = node.value?.node_id;
  analysisTimer = setTimeout(() => id && void project.analyzeContinuity(id), 400);
}

function onInput(event: Event) {
  const n = node.value;
  if (!n) return;
  const now = Date.now();
  // Las pulsaciones seguidas se agrupan en un único paso de «deshacer».
  project.patchNode(n.node_id, { text_payload: (event.target as HTMLTextAreaElement).value }, { undoable: now - lastEdit > 1000 });
  lastEdit = now;
  autosize();
  scheduleAnalysis();
}

watch(
  () => node.value?.node_id,
  async () => {
    await nextTick();
    autosize();
    scheduleAnalysis();
  },
  { immediate: true },
);
onBeforeUnmount(() => analysisTimer && clearTimeout(analysisTimer));
</script>

<template>
  <section v-if="node" class="dv-canvas" aria-label="Lienzo de escritura" data-testid="writing-canvas">
    <input
      class="w-full bg-transparent font-prose text-2xl text-dv-text outline-none placeholder:text-dv-muted"
      :value="node.title ?? ''"
      placeholder="Título de la escena"
      aria-label="Título de la escena"
      data-testid="node-title"
      @input="project.updateTitle(node.node_id, ($event.target as HTMLInputElement).value)"
    />
    <p class="mt-2 text-xs text-dv-muted" data-testid="word-count">{{ wordCount }} {{ wordCount === 1 ? 'palabra' : 'palabras' }} · Los cambios se guardan automáticamente</p>
    <div class="relative mt-4 flex gap-4">
      <ul class="dv-ghost-markers" aria-label="Marcas de dirección">
        <li v-for="(m, i) in markers" :key="i" class="dv-ghost-marker" :title="m.label" data-testid="ghost-marker">
          <span aria-hidden="true">{{ m.icon }}</span><span class="sr-only">{{ m.label }}</span>
        </li>
      </ul>
      <div class="dv-editor">
        <div class="dv-editor-backdrop" aria-hidden="true">
          <template v-for="(seg, i) in segments" :key="i"><mark v-if="seg.mark === 'continuity'" class="dv-continuity-mark" data-testid="continuity-mark">{{ seg.text }}</mark><mark v-else-if="seg.mark === 'sound'" class="dv-sound-chip" data-testid="sound-chip">{{ seg.text }}</mark><template v-else>{{ seg.text }}</template></template>
        </div>
        <textarea
          ref="textarea"
          class="dv-editor-input"
          :value="node.text_payload"
          spellcheck="true"
          aria-label="Prosa de la escena"
          placeholder="Escribe aquí tu escena…"
          data-testid="prose"
          @input="onInput"
        ></textarea>
      </div>
    </div>
    <section class="mt-3 space-y-2 text-sm" aria-label="Sonidos en palabras del texto" data-testid="sound-markers">
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="dv-btn-ghost" title="Selecciona una palabra y pulsa: el sonido sonará justo al llegar a ella" data-testid="insert-sound-marker" @click="insertMarker">🎧 Sonido en esta palabra</button>
        <button v-for="m in soundMarkers" :key="m.name" type="button" class="dv-sound-chip-button" :aria-pressed="editingMarker === m.name" :data-testid="`sound-marker-${m.name}`" @click="openMarker(m.name)">
          ⟦{{ m.name }}⟧ · {{ m.event ? `${m.event.asset.split('/').pop()}${m.event.delay_ms ? ` · ${String(m.event.delay_ms / 1000).replace('.', ',')} s` : ''}` : 'sin sonido' }}
        </button>
      </div>
      <form v-if="editingMarker" class="dv-margin-note space-y-2" data-testid="sound-marker-form" @submit.prevent="saveMarker">
        <p>Al llegar a «{{ editingMarker }}» suena:</p>
        <select v-model="markerForm.asset" class="dv-select w-full" aria-label="Sonido" data-testid="sound-marker-asset">
          <option v-for="path in audioAssets" :key="path" :value="path">{{ path.split('/').pop() }}</option>
        </select>
        <p v-if="!audioAssets.length" class="text-dv-muted">La obra aún no tiene sonidos: añádelos en Recursos o pídeselo al co-director.</p>
        <label class="flex items-center gap-2">Con un retardo de <input v-model.number="markerForm.seconds" type="number" min="0" max="120" step="0.5" class="dv-input w-20" data-testid="sound-marker-delay" /> segundos</label>
        <div class="flex gap-2">
          <button type="submit" class="dv-btn-accent" :disabled="!markerForm.asset" data-testid="sound-marker-save">Guardar</button>
          <button type="button" class="dv-btn-ghost" @click="editingMarker = null">Cancelar</button>
        </div>
      </form>
    </section>
    <aside v-if="issues.length" class="mt-3 space-y-2" aria-live="polite" data-testid="continuity-notes">
      <div v-for="(issue, i) in issues" :key="i" class="dv-margin-note">
        <p>{{ issue.message }}</p>
        <p v-if="issue.suggestion" class="text-dv-muted">{{ issue.suggestion }}</p>
      </div>
    </aside>
  </section>
  <div v-else class="space-y-3 py-8 text-dv-muted"><p>Tu historia empieza con una escena.</p><button type="button" class="dv-btn-accent" data-testid="create-first-scene" @click="project.addNode()">Crear la primera escena</button></div>
</template>
