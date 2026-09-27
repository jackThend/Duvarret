<script setup lang="ts">
import { ref } from 'vue';
import { WORK_MODE_LABELS, type WorkEntry } from '@/core/project';
import { isTauri } from '../services/desktop';
import { useStudioStore } from '../stores/studio';
import { useWorks } from '../composables/useWorks';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
const studio = useStudioStore();
const works = useWorks();
const desktop = isTauri();
const title = ref('');
const author = ref('');
const mode = ref<'taller' | 'injerto' | 'exegesis'>('taller');
const confirmDelete = ref<string | null>(null);

async function create() {
  if (mode.value !== 'taller') {
    // Injerto y Exégesis parten de un manuscrito: se abre el importador.
    emit('close');
    studio.importOpen = true;
    return;
  }
  if (await works.createBlank({ title: title.value.trim(), author: author.value.trim() })) emit('close');
}

async function open(entry: WorkEntry) {
  if (await works.openRecent(entry)) emit('close');
}

async function openFolder() {
  if (await works.openFolder()) emit('close');
}

const when = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
const keyOf = (e: WorkEntry) => `${e.kind}:${e.location}`;
</script>

<template>
  <Modal title="Obras" wide @close="emit('close')">
    <div class="grid gap-6 text-sm md:grid-cols-2" data-testid="works-dialog">
      <section class="space-y-3" aria-label="Nueva obra">
        <h3 class="dv-section-title">Nueva obra</h3>
        <label class="block"><span class="text-dv-muted">Título</span><input v-model="title" class="dv-input w-full" placeholder="Obra sin título" data-testid="new-work-title" /></label>
        <label class="block"><span class="text-dv-muted">Autoría</span><input v-model="author" class="dv-input w-full" data-testid="new-work-author" /></label>
        <fieldset class="space-y-1">
          <legend class="text-dv-muted">¿Cómo quieres empezar?</legend>
          <label class="flex items-center gap-2"><input v-model="mode" type="radio" value="taller" data-testid="mode-taller" /> {{ WORK_MODE_LABELS.taller }}: lienzo en blanco</label>
          <label class="flex items-center gap-2"><input v-model="mode" type="radio" value="injerto" /> {{ WORK_MODE_LABELS.injerto }}: continuar unos capítulos</label>
          <label class="flex items-center gap-2"><input v-model="mode" type="radio" value="exegesis" /> {{ WORK_MODE_LABELS.exegesis }}: adaptar una obra completa</label>
        </fieldset>
        <p v-if="desktop" class="text-xs text-dv-muted">Te preguntaremos en qué carpeta de tu ordenador guardarla.</p>
        <p v-else class="text-xs text-dv-muted">Se guardará en este dispositivo.</p>
        <button type="button" class="dv-btn-accent" :disabled="works.busy.value" data-testid="create-work" @click="create">
          {{ mode === 'taller' ? 'Crear obra' : 'Elegir manuscrito…' }}
        </button>
        <div v-if="desktop" class="border-t border-dv-border pt-3">
          <button type="button" class="dv-btn-ghost" :disabled="works.busy.value" data-testid="open-folder" @click="openFolder">Abrir una obra de una carpeta…</button>
        </div>
      </section>

      <section class="space-y-2" aria-label="Obras recientes">
        <h3 class="dv-section-title">Obras recientes</h3>
        <p v-if="!works.recents.value.length" class="text-dv-muted">Aún no has guardado ninguna obra.</p>
        <ul class="space-y-2" data-testid="recent-works">
          <li v-for="entry in works.recents.value" :key="keyOf(entry)" class="dv-pitch !p-3" :data-testid="`recent-${entry.location}`">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate font-prose text-base">{{ entry.title }}</p>
                <p class="truncate text-xs text-dv-muted" :title="entry.location">
                  {{ entry.author ? `${entry.author} · ` : '' }}{{ entry.kind === 'browser' ? 'En este dispositivo' : entry.location }} · {{ when(entry.openedAt) }}
                </p>
              </div>
              <span v-if="works.isCurrent(entry)" class="shrink-0 text-xs text-dv-accent-2">Abierta</span>
              <button v-else type="button" class="dv-btn-accent shrink-0" :disabled="works.busy.value" data-testid="open-recent" @click="open(entry)">Abrir</button>
            </div>
            <div v-if="!works.isCurrent(entry)" class="mt-2 flex gap-3 text-xs">
              <button type="button" class="dv-link !opacity-70" data-testid="forget-recent" @click="works.forget(entry)">Quitar de la lista</button>
              <template v-if="entry.kind === 'browser'">
                <button v-if="confirmDelete !== keyOf(entry)" type="button" class="dv-link !opacity-70" data-testid="delete-recent" @click="confirmDelete = keyOf(entry)">Eliminar del dispositivo</button>
                <span v-else class="flex gap-2" role="alert">
                  ¿Seguro? No se puede deshacer.
                  <button type="button" class="font-semibold text-dv-danger" data-testid="confirm-delete" @click="works.deleteFromDevice(entry); confirmDelete = null">Eliminar</button>
                  <button type="button" @click="confirmDelete = null">Cancelar</button>
                </span>
              </template>
            </div>
          </li>
        </ul>
      </section>
    </div>
    <p v-if="works.error.value" role="alert" class="mt-4 text-sm text-dv-danger" data-testid="works-error">{{ works.error.value }}</p>
  </Modal>
</template>
