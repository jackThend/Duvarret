<script setup lang="ts">
import { ref } from 'vue';
import { FORMAT_ICONS, nodeFormats, useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';

const project = useProjectStore();
const studio = useStudioStore();
const openCharacter = ref<string | null>(null);

const FORMAT_NAMES = { text: 'Texto tradicional', ergodic: 'Ergódico', visual_novel: 'Novela visual', gameplay: 'Minijuego', audio: 'Audio binaural' } as const;

function appearances(id: string) {
  return project.nodes.filter((n) => n.visual_novel_overlay?.active_speaker === id || n.visual_novel_overlay?.lines.some((l) => l.speaker === id)).length;
}
</script>

<template>
  <nav class="flex h-full flex-col gap-4 overflow-y-auto p-3 text-sm" aria-label="Estructura narrativa y lore" data-testid="left-panel">
    <section v-for="chapter in project.chapters" :key="chapter.id" :aria-label="chapter.title">
      <h3 class="dv-section-title">▾ {{ chapter.title }}</h3>
      <ul class="mt-1 space-y-0.5">
        <li v-for="node in chapter.nodes" :key="node.node_id">
          <button
            type="button"
            class="dv-tree-item"
            :class="{ 'is-active': node.node_id === project.selectedNodeId }"
            :aria-current="node.node_id === project.selectedNodeId ? 'true' : undefined"
            :data-testid="`beat-${node.node_id}`"
            @click="project.select(node.node_id)"
          >
            <span class="shrink-0" :title="nodeFormats(node).map((f) => FORMAT_NAMES[f]).join(', ')" :aria-label="nodeFormats(node).map((f) => FORMAT_NAMES[f]).join(', ')">
              {{ nodeFormats(node).map((f) => FORMAT_ICONS[f]).join('') }}
            </span>
            <span class="truncate">{{ node.title || node.node_id }}</span>
          </button>
        </li>
      </ul>
    </section>
    <button type="button" class="dv-btn-ghost self-start" data-testid="add-node" @click="project.addNode()">＋ Nueva escena</button>

    <section aria-label="Personajes">
      <h3 class="dv-section-title">▾ Personajes ({{ project.characters.length }})</h3>
      <ul class="mt-1 space-y-0.5">
        <li v-for="c in project.characters" :key="c.id">
          <button type="button" class="dv-tree-item" :aria-expanded="openCharacter === c.id" @click="openCharacter = openCharacter === c.id ? null : c.id">
            <span class="inline-block h-2 w-2 rounded-full" :style="{ background: c.color_accent }" aria-hidden="true"></span>
            <span class="truncate">{{ c.name }}</span>
            <span class="ml-auto text-dv-muted">{{ appearances(c.id) || '' }}</span>
          </button>
          <p v-if="openCharacter === c.id" class="px-6 pb-1 text-xs text-dv-muted">
            Estados: {{ Object.keys(c.sprites).join(', ') || 'neutral' }} · aparece en {{ appearances(c.id) }} escenas
          </p>
        </li>
      </ul>
    </section>

    <section aria-label="Inventario">
      <h3 class="dv-section-title">▾ Inventario ({{ project.items.length }})</h3>
      <ul class="mt-1 space-y-0.5">
        <li v-for="i in project.items" :key="i.id" class="dv-tree-item cursor-default" :title="i.description">
          <span aria-hidden="true">✦</span><span class="truncate">{{ i.name }}</span>
        </li>
      </ul>
    </section>

    <section aria-label="Grafo semántico">
      <h3 class="dv-section-title">▾ Grafo semántico</h3>
      <button type="button" class="dv-btn-ghost mt-1" data-testid="open-graph" @click="studio.graphOpen = true">Abrir mapa</button>
    </section>
  </nav>
</template>
