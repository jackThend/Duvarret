<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { WORK_MODE_LABELS, type WorkEntry } from '@/core/project';
import { isTauri } from '../services/desktop';
import { useStudioStore } from '../stores/studio';
import { useWorks } from '../composables/useWorks';
import Modal from './Modal.vue';
import LocalProfile from './LocalProfile.vue';
import { personalLibrary } from '../services/personalLibrary';

const emit = defineEmits<{ close: [] }>();
const studio = useStudioStore();
const works = useWorks();
const desktop = isTauri();
const query = ref(''), trash = ref(false), chooseFolder = ref(false);
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const entries = computed(() => works.all.value.filter(e => Boolean(e.trashedAt) === trash.value && normalize(`${e.title} ${e.author}`).includes(normalize(query.value.trim()))));
const title = ref('');
const author = ref('');
onMounted(async () => { try { const { profile } = await personalLibrary.load(); if (!author.value) author.value = profile.name; } catch { /* perfil opcional */ } });
const mode = ref<'taller' | 'injerto' | 'exegesis'>('taller');
const confirmDelete = ref<string | null>(null);

async function create() {
  if (mode.value !== 'taller') {
    // Injerto y Exégesis parten de un manuscrito: se abre el importador.
    emit('close');
    studio.importOpen = true;
    return;
  }
  if (await works.createBlank({ title: title.value.trim(), author: author.value.trim(), chooseFolder: chooseFolder.value })) emit('close');
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
  <Modal title="Mis obras" wide @close="emit('close')">
    <div class="grid gap-6 text-sm md:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.4fr)]" data-testid="works-dialog">
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
        <p v-if="desktop" class="text-xs text-dv-muted">Se guardará automáticamente en tu carpeta personal de Studio.</p>
        <p v-else class="text-xs text-dv-muted">Se guardará en este dispositivo.</p>
        <label v-if="desktop && mode === 'taller'" class="flex items-center gap-2 text-xs"><input v-model="chooseFolder" type="checkbox" data-testid="choose-work-folder" /> Elegir otra carpeta</label>
        <button type="button" class="dv-btn-accent" :disabled="works.busy.value" data-testid="create-work" @click="create">
          {{ mode === 'taller' ? 'Crear obra' : 'Elegir manuscrito…' }}
        </button>
        <div v-if="desktop" class="border-t border-dv-border pt-3">
          <button type="button" class="dv-btn-ghost" :disabled="works.busy.value" data-testid="open-folder" @click="openFolder">Abrir una obra de una carpeta…</button>
        </div>
        <LocalProfile @saved="name => author = name" />
      </section>

      <section class="space-y-2" aria-label="Biblioteca de obras">
        <div class="flex flex-wrap gap-2"><button type="button" class="dv-btn-ghost" :aria-pressed="!trash" data-testid="works-active" @click="trash = false">Mis obras ({{ works.recents.value.length }})</button><button type="button" class="dv-btn-ghost" :aria-pressed="trash" data-testid="works-trash-tab" @click="trash = true">Papelera</button></div>
        <input v-model="query" type="search" class="dv-input w-full" aria-label="Buscar obras por título o autoría" placeholder="Buscar por título o autoría…" data-testid="works-search" />
        <p v-if="!entries.length" class="text-dv-muted">{{ query ? 'No hay coincidencias.' : trash ? 'La papelera está vacía.' : 'Tu próxima historia empieza aquí. Crea una obra o añade una carpeta existente.' }}</p>
        <ul class="space-y-2" data-testid="recent-works">
          <li v-for="entry in entries" :key="keyOf(entry)" class="dv-pitch !p-3" :data-testid="`recent-${entry.location}`">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate font-prose text-base">{{ entry.title }}</p>
                <p class="truncate text-xs text-dv-muted" :title="entry.location">
                  {{ entry.author ? `${entry.author} · ` : '' }}{{ entry.kind === 'browser' ? 'En este dispositivo' : entry.location }} · {{ when(entry.openedAt) }}
                </p>
              </div>
              <span v-if="works.isCurrent(entry)" class="shrink-0 text-xs text-dv-accent-2">Abierta</span>
              <button v-else-if="!trash" type="button" class="dv-btn-accent shrink-0" :disabled="works.busy.value" data-testid="open-recent" @click="open(entry)">Continuar</button>
            </div>
            <div v-if="!works.isCurrent(entry)" class="mt-2 flex flex-wrap gap-3 text-xs">
              <button v-if="!trash" type="button" class="dv-btn-ghost" :disabled="works.busy.value" data-testid="trash-work" @click="works.trash(entry)">Enviar a papelera</button>
              <template v-else>
                <button type="button" class="dv-btn-ghost" :disabled="works.busy.value" data-testid="restore-work" @click="works.restore(entry)">Restaurar</button>
                <button type="button" class="dv-btn-ghost" :disabled="works.busy.value" data-testid="forget-recent" @click="works.forget(entry)">Quitar referencia · conservar archivos</button>
                <button v-if="confirmDelete !== keyOf(entry)" type="button" class="dv-btn-ghost text-dv-danger" :disabled="works.busy.value" data-testid="delete-recent" @click="confirmDelete = keyOf(entry)">Borrar definitivamente…</button>
                <div v-else class="space-y-2" role="alert">
                  <p>Se borrará esta obra y sus recursos propios. No se puede deshacer. Las carpetas externas están protegidas.</p>
                  <button type="button" class="dv-btn-ghost text-dv-danger" :disabled="works.busy.value" data-testid="confirm-delete" @click="works.deleteFromDevice(entry).then(() => confirmDelete = null)">Borrar definitivamente</button>
                  <button type="button" class="dv-btn-ghost" @click="confirmDelete = null">Cancelar</button>
                </div>
              </template>
            </div>
          </li>
        </ul>
        <p v-if="trash" class="text-xs text-dv-muted">La papelera conserva los archivos. Abre otra obra para poder retirar la que tienes abierta.</p>
      </section>
    </div>
    <p v-if="works.error.value" role="alert" class="mt-4 text-sm text-dv-danger" data-testid="works-error">{{ works.error.value }}</p>
  </Modal>
</template>
