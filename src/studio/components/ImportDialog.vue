<script setup lang="ts">
import { ref } from 'vue';
import { MANUSCRIPT_EXTENSIONS, readManuscript } from '@/core/ingest/readers';
import { parseManuscript, type ParsedManuscript } from '@/core/ingest/sceneParser';
import { TONE_LABELS } from '@/core/ingest/toneAnalyzer';
import { useWorks } from '../composables/useWorks';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
const works = useWorks();
const parsed = ref<ParsedManuscript | null>(null);
const error = ref('');
const reading = ref(false);
const title = ref('');

const INTERACTION_LABELS = { dialogo: 'Diálogo', monologo: 'Monólogo', enigma: 'Enigma', aparatos: 'Aparatos', narracion: 'Narración' } as const;

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Se vacía el selector para poder volver a elegir el mismo archivo (p. ej. tras corregirlo).
  input.value = '';
  if (!file) return;
  // Un archivo nuevo sustituye al anterior: si no se puede leer, no debe quedar el viejo listo para importar.
  parsed.value = null;
  error.value = '';
  reading.value = true;
  try {
    const text = await readManuscript(file.name, new Uint8Array(await file.arrayBuffer()));
    const result = parseManuscript(text, { title: file.name.replace(/\.[^.]+$/, '') });
    if (!result.beats.length) {
      error.value = `«${file.name}» no contiene texto que se pueda convertir en escenas.`;
      return;
    }
    parsed.value = result;
    title.value = result.title;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo leer el manuscrito.';
  } finally {
    reading.value = false;
  }
}

async function confirm() {
  if (!parsed.value) return;
  if (await works.createFromManuscript(parsed.value, { title: title.value.trim() || parsed.value.title })) emit('close');
}
</script>

<template>
  <Modal title="Importar manuscrito" wide @close="emit('close')">
    <div class="space-y-4 text-sm" data-testid="import-dialog">
      <p class="text-dv-muted">Sube tu obra en Word (.docx), libro electrónico (.epub), PDF, .md o .txt. La dividiremos en escenas de 300 a 800 palabras respetando sus capítulos.</p>
      <input type="file" :accept="MANUSCRIPT_EXTENSIONS.join(',')" aria-label="Archivo del manuscrito" data-testid="import-file" @change="onFile" />
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
        <p class="text-xs text-dv-muted">Se creará una obra nueva; la que tienes abierta se guarda y queda en «Obras».</p>
        <button type="button" class="dv-btn-accent" :disabled="works.busy.value" data-testid="import-confirm" @click="confirm">Crear la obra</button>
        <p v-if="works.error.value" role="alert" class="text-dv-danger">{{ works.error.value }}</p>
      </template>
    </div>
  </Modal>
</template>
