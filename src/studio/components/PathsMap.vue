<script setup lang="ts">
import { computed } from 'vue';
import { flowGraph, type FlowEdge } from '@/core/manifest';
import { useProjectStore } from '../stores/project';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();

const COL = 230;
const ROW = 86;
const W = 170;
const H = 50;
const PAD = 24;

const graph = computed(() => flowGraph(project.manifest));
const pos = computed(() => new Map(graph.value.nodes.map((n) => [n.id, { x: PAD + n.column * COL, y: PAD + n.row * ROW }])));
const width = computed(() => PAD * 2 + (graph.value.columns - 1) * COL + W);
const height = computed(() => PAD * 2 + Math.max(1, ...graph.value.nodes.map((n) => n.row + 1)) * ROW - (ROW - H));
const unreachable = computed(() => graph.value.nodes.filter((n) => !n.reachable));
const broken = computed(() => graph.value.edges.filter((e) => e.broken));
const hasUnreachableColumn = computed(() => unreachable.value.length > 0);

const COLORS: Record<FlowEdge['kind'], string> = {
  next: 'var(--dv-muted)',
  choice: 'var(--dv-accent-2)',
  success: '#22c55e',
  failure: 'var(--dv-danger)',
  voice: 'var(--dv-mystic)',
};

function path(edge: FlowEdge): string {
  const a = pos.value.get(edge.from)!;
  const b = pos.value.get(edge.to);
  if (!b) return `M ${a.x + W} ${a.y + H / 2} l 28 0`;
  if (edge.from === edge.to) return `M ${a.x + W} ${a.y + 14} c 40 -30 40 50 0 22`;
  const [x1, y1, x2, y2] = [a.x + W, a.y + H / 2, b.x, b.y + H / 2];
  // Hacia atrás (bucles narrativos): se curva por encima.
  if (x2 <= x1) return `M ${x1} ${y1} C ${x1 + 60} ${y1 - 70}, ${x2 - 60} ${y2 - 70}, ${x2} ${y2}`;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

function open(id: string) {
  project.select(id);
  emit('close');
}

const short = (t: string, n = 22) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
</script>

<template>
  <Modal title="Mapa de caminos" wide @close="emit('close')">
    <div class="space-y-3 text-sm" data-testid="paths-map">
      <div class="overflow-auto rounded-lg border border-dv-border" style="max-height: 62vh">
        <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" role="group" aria-label="Escenas de la obra y cómo se conectan">
          <defs>
            <marker v-for="(color, kind) in COLORS" :id="`dv-arrow-${kind}`" :key="kind" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" :fill="color" />
            </marker>
          </defs>
          <rect
            v-if="hasUnreachableColumn"
            :x="PAD + (graph.columns - 1) * COL - 12"
            y="4"
            :width="W + 24"
            :height="height - 8"
            rx="10"
            class="dv-flow-orphans"
          />
          <g v-for="(edge, i) in graph.edges" :key="i" :data-testid="edge.broken ? 'flow-broken' : 'flow-edge'">
            <path :d="path(edge)" fill="none" :stroke="edge.broken ? 'var(--dv-danger)' : COLORS[edge.kind]" :stroke-dasharray="edge.kind === 'choice' || edge.broken ? '5 4' : undefined" stroke-width="1.6" :marker-end="`url(#dv-arrow-${edge.broken ? 'failure' : edge.kind})`">
              <title>{{ edge.label }}{{ edge.broken ? ' — lleva a una escena que no existe' : '' }}</title>
            </path>
            <text v-if="edge.broken" :x="pos.get(edge.from)!.x + W + 32" :y="pos.get(edge.from)!.y + H / 2 + 4" class="dv-flow-missing">?</text>
          </g>
          <g
            v-for="n in graph.nodes"
            :key="n.id"
            class="dv-flow-node"
            :class="{ 'is-selected': n.id === project.selectedNodeId, 'is-orphan': !n.reachable, 'is-start': n.id === graph.start }"
            tabindex="0"
            role="button"
            :aria-label="`${n.title}${n.id === graph.start ? ', inicio' : ''}${n.ending ? ', final' : ''}${!n.reachable ? ', ningún camino llega aquí' : ''}`"
            :data-testid="`flow-node-${n.id}`"
            @click="open(n.id)"
            @keydown.enter="open(n.id)"
          >
            <rect :x="pos.get(n.id)!.x" :y="pos.get(n.id)!.y" :width="W" :height="H" rx="10" />
            <text :x="pos.get(n.id)!.x + 12" :y="pos.get(n.id)!.y + 21" class="dv-flow-title">{{ short(n.title) }}</text>
            <text :x="pos.get(n.id)!.x + 12" :y="pos.get(n.id)!.y + 38" class="dv-flow-sub">
              {{ n.id === graph.start ? 'Inicio' : n.ending ? 'Final' : !n.reachable ? 'Sin camino de llegada' : '' }}
            </text>
          </g>
        </svg>
      </div>
      <ul class="flex flex-wrap gap-4 text-xs text-dv-muted">
        <li><span :style="{ color: COLORS.next }">━</span> Continuación</li>
        <li><span :style="{ color: COLORS.choice }">┅</span> Elección</li>
        <li><span :style="{ color: COLORS.success }">━</span> Enigma resuelto</li>
        <li><span :style="{ color: COLORS.failure }">━</span> Enigma fallido</li>
        <li><span :style="{ color: COLORS.voice }">━</span> Atajo sin pantalla</li>
      </ul>
      <div v-if="unreachable.length || broken.length" class="dv-margin-note" role="alert" data-testid="paths-warnings">
        <p v-if="unreachable.length">Ningún camino llega a: {{ unreachable.map((n) => `«${n.title}»`).join(', ') }}.</p>
        <p v-if="broken.length">Hay {{ broken.length }} {{ broken.length === 1 ? 'camino que lleva' : 'caminos que llevan' }} a escenas que no existen.</p>
      </div>
      <p v-else class="text-xs text-dv-muted" data-testid="paths-ok">Todas las escenas son alcanzables y todos los caminos llevan a algún sitio.</p>
    </div>
  </Modal>
</template>
