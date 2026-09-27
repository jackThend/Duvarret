<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useStudioStore } from '../stores/studio';
import { useProjectStore } from '../stores/project';

const studio = useStudioStore();
const project = useProjectStore();
const draft = ref('');
const input = ref<HTMLTextAreaElement | null>(null);
const log = ref<HTMLElement | null>(null);

async function send() {
  const text = draft.value;
  draft.value = '';
  await studio.ask(text);
}

watch(
  () => studio.chat.length,
  async () => {
    await nextTick();
    log.value?.scrollTo?.({ top: log.value.scrollHeight });
  },
);

defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <section class="flex flex-col gap-2" aria-label="Conversación con el Agente Director" data-testid="agent-chat">
    <h3 class="dv-section-title">Co-director</h3>
    <div ref="log" class="max-h-56 space-y-2 overflow-y-auto" role="log" aria-live="polite">
      <p v-if="!studio.chat.length" class="text-sm text-dv-muted">
        Cuéntale a tu co-director cómo imaginas la escena: «Quiero que cuando lea esta frase se escuche una respiración en la oreja izquierda».
      </p>
      <p v-for="entry in studio.chat" :key="entry.id" class="dv-chat" :class="`dv-chat-${entry.role}`" :data-testid="`chat-${entry.role}`">
        <span class="font-semibold">{{ entry.role === 'author' ? 'Tú' : 'Director' }}:</span>
        <span :class="{ 'animate-pulse': entry.pending }"> {{ entry.text }}</span>
      </p>
    </div>
    <form class="flex items-end gap-2" @submit.prevent="send">
      <label class="sr-only" for="dv-agent-input">Mensaje para el co-director</label>
      <textarea
        id="dv-agent-input"
        ref="input"
        v-model="draft"
        rows="2"
        class="dv-input flex-1 resize-none"
        :placeholder="project.selectedNode ? `Sobre «${project.selectedNode.title ?? project.selectedNode.node_id}»…` : 'Escribe al co-director…'"
        data-testid="agent-input"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <button type="submit" class="dv-btn-accent" :disabled="studio.busy || !draft.trim()" data-testid="agent-send">Enviar</button>
    </form>
  </section>
</template>
