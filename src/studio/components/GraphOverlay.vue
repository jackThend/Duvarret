<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CATEGORY_LABELS, ENTITY_CATEGORIES, type EntityState, type LoreEntity, type Subgraph } from '@/core/lore';
import { useProjectStore } from '../stores/project';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const graph = ref<Subgraph>({ nodes: [], edges: [] });
const selected = ref<LoreEntity | null>(null);
const confirmPrune = ref(false);
const state = ref<EntityState | null>(null);
const SIZE = 560;

const COLORS: Record<string, string> = {
  character: '#f59e0b',
  location: '#10b981',
  item: '#06b6d4',
  faction: '#a855f7',
  mystery: '#ef4444',
  emotional_state: '#ec4899',
  scene: '#94a3b8',
};

async function load() {
  graph.value = (await project.lore?.subgraph()) ?? { nodes: [], edges: [] };
}

/** Disposición en constelación: cada categoría ocupa un anillo concéntrico (determinista). */
const layout = computed(() => {
  const positions = new Map<string, { x: number; y: number }>();
  const rings = ENTITY_CATEGORIES.filter((c) => graph.value.nodes.some((n) => n.category === c));
  rings.forEach((category, ring) => {
    const members = graph.value.nodes.filter((n) => n.category === category);
    const radius = 60 + ring * ((SIZE / 2 - 80) / Math.max(1, rings.length - 1 || 1));
    members.forEach((n, i) => {
      const angle = (i / members.length) * Math.PI * 2 + ring * 0.7;
      positions.set(n.id, { x: SIZE / 2 + Math.cos(angle) * radius, y: SIZE / 2 + Math.sin(angle) * radius });
    });
  });
  return positions;
});

async function inspect(entity: LoreEntity) {
  confirmPrune.value = false;
  selected.value = entity;
  state.value = (await project.lore?.stateAt(entity.id)) ?? null;
}

async function prune() {
  if (!selected.value || !project.lore) return;
  await project.lore.removeEntity(selected.value.id);
  selected.value = null;
  await load();
}

onMounted(load);
defineExpose({ load });
</script>

<template>
  <Modal title="Personajes y relaciones" wide @close="emit('close')">
    <div class="flex flex-wrap gap-4" data-testid="graph-overlay">
      <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" class="max-h-[70vh] w-full max-w-[560px]" role="img" aria-label="Constelación de personajes, lugares, objetos y escenas">
        <line
          v-for="edge in graph.edges"
          :key="edge.id"
          :x1="layout.get(edge.source_node_id)?.x"
          :y1="layout.get(edge.source_node_id)?.y"
          :x2="layout.get(edge.target_node_id)?.x"
          :y2="layout.get(edge.target_node_id)?.y"
          class="dv-graph-edge"
          :stroke-opacity="0.25 + edge.weight * 0.5"
        />
        <g v-for="node in graph.nodes" :key="node.id" class="cursor-pointer" tabindex="0" role="button" :aria-label="`${node.name} (${CATEGORY_LABELS[node.category]})`" :data-testid="`graph-node-${node.id}`" @click="inspect(node)" @keydown.enter="inspect(node)">
          <circle :cx="layout.get(node.id)?.x" :cy="layout.get(node.id)?.y" :r="selected?.id === node.id ? 9 : 6" :fill="COLORS[node.category]" />
          <text :x="(layout.get(node.id)?.x ?? 0) + 9" :y="(layout.get(node.id)?.y ?? 0) + 4" class="dv-graph-label">{{ node.name }}</text>
        </g>
      </svg>
      <aside class="min-w-56 flex-1 space-y-2 text-sm">
        <ul class="space-y-1">
          <li v-for="c in ENTITY_CATEGORIES.filter((c) => graph.nodes.some((n) => n.category === c))" :key="c" class="flex items-center gap-2 text-dv-muted">
            <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ background: COLORS[c] }"></span>{{ CATEGORY_LABELS[c] }}
          </li>
        </ul>
        <div v-if="selected" class="dv-margin-note" data-testid="graph-detail">
          <p class="font-semibold">{{ selected.name }}</p>
          <p class="text-dv-muted">{{ CATEGORY_LABELS[selected.category] }}</p>
          <p v-if="state && selected.category === 'character'">{{ state.alive ? 'Con vida' : 'Ha muerto' }}</p>
          <p v-if="state && selected.category === 'item'">{{ state.intact ? 'Disponible' : 'Ya no está disponible' }}</p>
          <button v-if="!confirmPrune" type="button" class="dv-btn-ghost mt-2" data-testid="graph-prune" @click="confirmPrune = true">Quitar del mapa</button>
          <div v-else class="mt-3 space-y-2" role="alert">
            <p>Se quitará «{{ selected.name }}» del registro de relaciones. Esta acción no se puede deshacer.</p>
            <button type="button" class="dv-btn-ghost" data-testid="graph-prune-confirm" @click="prune">Sí, quitar del mapa</button>
            <button type="button" class="dv-btn-ghost" @click="confirmPrune = false">Cancelar</button>
          </div>
        </div>
        <p v-if="!graph.nodes.length" class="text-dv-muted">Aquí aparecerán los personajes, lugares y objetos registrados en tu historia.</p>
      </aside>
    </div>
  </Modal>
</template>
