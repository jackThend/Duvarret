<script setup lang="ts">
import { ref } from 'vue';
import { readManuscript } from '@/core/ingest/readers';
import { parseManuscript, type ParsedManuscript } from '@/core/ingest/sceneParser';
import { TONE_LABELS } from '@/core/ingest/toneAnalyzer';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const studio = useStudioStore();
const parsed = ref<ParsedManuscript | null>(null);
const error = ref('');
const reading = ref(false);
const title = ref('');

const INTERACTION_LABELS = { dialogo: 'Diálogo', monologo: 'Monólogo', enigma: 'Enigma', aparatos: 'Aparatos', narracion: 'Narración' } as const;

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = '';
  reading.value = true;
  try {
    const text = await readManuscript(file.name, new Uint8Array(await file.arrayBuffer()));
    parsed.value = parseManuscript(text, { title: file.name.replace(/\.[^.]+$/, '') });
    title.value = parsed.value.title;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo leer el manuscrito.';
  } finally {
    reading.value = false;
  }
}

async function confirm() {
  if (!parsed.value) return;
  await project.importManuscript(parsed.value, { title: title.value });
  studio.reset();
  studio.refreshPitches();
  emit('close');
}
</script>

<template>
  <Modal title="Importar manuscrito" wide @close="emit('close')">
    <div class="space-y-4 text-sm" data-testid="import-dialog">
      <p class="text-dv-muted">Sube tu obra en .txt, .md o .pdf. La dividiremos en escenas de 300 a 800 palabras respetando sus capítulos.</p>
      <input type="file" accept=".txt,.md,.markdown,.pdf" aria-label="Archivo del manuscrito" data-testid="import-file" @change="onFile" />
      <p v-if="reading" class="text-dv-muted">Leyendo…</p>
      <p v-if="error" role="alert" class="text-dv-danger">{{ error }}</p>
      <template v-if="parsed">
        <label class="block"><span class="text-dv-muted">Título</span><input v-model="title" class="dv-input w-full" /></label>
        <p>{{ parsed.chapters.length }} capítulos · {{ parsed.beats.length }} escenas · {{ parsed.totalWords.toLocaleString('es') }} palabras</p>
        <ol class="max-h-64 space-y-1 overflow-y-auto" data-testid="import-beats">
          <li v-for="beat in parsed.beats" :key="beat.id" class="flex justify-between gap-3 border-b border-dv-border py-1">
            <span class="truncate">{{ beat.chapterTitle }} · {{ beat.words }} palabras</span>
            <span class="shrink-0 text-dv-muted">
              {{ beat.analysis.dominantTone ? TONE_LABELS[beat.analysis.dominantTone] : 'Sereno' }} · {{ INTERACTION_LABELS[beat.analysis.interaction] }}
            </span>
          </li>
        </ol>
        <button type="button" class="dv-btn-accent" data-testid="import-confirm" @click="confirm">Crear la obra</button>
      </template>
    </div>
  </Modal>
</template>
