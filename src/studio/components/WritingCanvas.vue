<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { LAYOUT_LABELS, MODULE_LABELS } from '@/core/manifest';
import { describePosition } from '@/runtime/audio/coordinates';
import { useProjectStore } from '../stores/project';

const project = useProjectStore();
const textarea = ref<HTMLTextAreaElement | null>(null);
let lastEdit = 0;
let analysisTimer: ReturnType<typeof setTimeout> | undefined;

const node = computed(() => project.selectedNode);
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

/** Segmentos del texto con los fragmentos a subrayar (continuidad). */
const segments = computed(() => {
  const text = node.value?.text_payload ?? '';
  const ranges = issues.value
    .filter((i) => i.range)
    .map((i) => i.range!)
    .sort((a, b) => a.start - b.start);
  const out: { text: string; mark: boolean }[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue;
    out.push({ text: text.slice(cursor, r.start), mark: false }, { text: text.slice(r.start, r.end), mark: true });
    cursor = r.end;
  }
  out.push({ text: `${text.slice(cursor)}\n`, mark: false });
  return out;
});

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
      @change="project.updateTitle(node.node_id, ($event.target as HTMLInputElement).value)"
    />
    <div class="relative mt-4 flex gap-4">
      <ul class="dv-ghost-markers" aria-label="Marcas de dirección">
        <li v-for="(m, i) in markers" :key="i" class="dv-ghost-marker" :title="m.label" data-testid="ghost-marker">
          <span aria-hidden="true">{{ m.icon }}</span><span class="sr-only">{{ m.label }}</span>
        </li>
      </ul>
      <div class="dv-editor">
        <div class="dv-editor-backdrop" aria-hidden="true">
          <template v-for="(seg, i) in segments" :key="i"><mark v-if="seg.mark" class="dv-continuity-mark" data-testid="continuity-mark">{{ seg.text }}</mark><template v-else>{{ seg.text }}</template></template>
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
    <aside v-if="issues.length" class="mt-3 space-y-2" aria-live="polite" data-testid="continuity-notes">
      <div v-for="(issue, i) in issues" :key="i" class="dv-margin-note">
        <p>{{ issue.message }}</p>
        <p v-if="issue.suggestion" class="text-dv-muted">{{ issue.suggestion }}</p>
      </div>
    </aside>
  </section>
  <p v-else class="p-8 text-dv-muted">Elige o crea una escena para empezar a escribir.</p>
</template>
