<script setup lang="ts">
import { ref } from 'vue';
import { TARGET_LABELS, type CompileResult, type ExportTarget } from '@/core/compiler';
import { isTauri } from '@/core/lore/tauriDriver';
import { useProjectStore } from '../stores/project';
import { compileFromStudio, loadPlayerRuntime, savePortableZip, savePortable, saveExport } from '../services/exporter';
import { showExportFolder } from '../services/desktop';
import { useStudioStore } from '../stores/studio';
import ExportDialog from './ExportDialog.vue';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore();
const studio = useStudioStore();
const busy = ref<ExportTarget | 'all' | null>(null);
const message = ref('');
const pending = ref<string[]>([]);
const desktop = isTauri();
const selected = ref<ExportTarget[]>(['web']);
const prepared = ref<ExportTarget[]>([]);
const failed = ref(false);
const allowDraft = ref(false);
const completed = ref<ExportTarget | 'all' | null>(null);
const location = ref('');
const voiceRepair = ref(false);

const DESCRIPTIONS: Record<ExportTarget, string> = {
  web: 'Para compartir por un enlace y leer en móviles, tabletas y ordenadores. Prepara un ZIP para subir a GitHub Pages o itch.io.',
  audio_drama: 'Una versión web que comienza con la escucha sin pantalla. Incluye voz, decisiones y guion accesible; no es un MP3.',
  native: 'Una aplicación para el mismo sistema de este equipo. Comparte la carpeta completa. Para Android o iPhone, elige Web.',
};

async function run(target: ExportTarget) {
  if (busy.value) return;
  busy.value = target;
  const source = project.manifest;
  const storage = project.storage;
  message.value = '';
  completed.value = null;
  voiceRepair.value = false;
  failed.value = false;
  pending.value = [];
  try {
    await project.save();
    const result = await compileFromStudio({ manifest: source, resolveAsset: project.resolveAsset, target });
    if (storage !== project.storage || source !== project.manifest) throw new Error('La obra cambió durante la preparación. Vuelve a preparar la versión actual.');
    if (!result.ok) {
      message.value = result.blocking.map(issue => issue.message).join(' ') || 'La obra tiene escenas por resolver antes de publicarse.';
      voiceRepair.value = result.blocking.some(issue => issue.code === 'missing_narration');
      failed.value = true;
      return;
    }
    pending.value = result.missingAssets;
    if (pending.value.length && !allowDraft.value) {
      failed.value = true;
      message.value = 'Faltan sonidos o imágenes. Aporta los que se nombran arriba o, si quieres compartirla así, confirma que se exporte con recursos de prueba.';
      return;
    }
    const root = storage.kind === 'tauri' ? storage.location : null;
    const saved = target === 'native' && root ? await savePortable(result, root) : await saveExport(result, root);
    location.value = saved.location;
    completed.value = target;
    message.value = root ? 'La publicación está preparada y guardada en la carpeta de tu obra.' : 'Archivo preparado. Tu navegador iniciará la descarga.';
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'No se pudo exportar la obra.';
    failed.value = true;
  } finally {
    busy.value = null;
  }
}

async function reveal() {
  try { await showExportFolder(project.storage.location); }
  catch { failed.value = true; message.value = 'No se pudo abrir la carpeta. Encontrarás la publicación dentro de export, en la carpeta de tu obra.'; }
}
async function runAll() {
  if (busy.value || !selected.value.length) return;
  busy.value = 'all';
  completed.value = null;
  message.value = '';
  pending.value = [];
  failed.value = false;
  voiceRepair.value = false;
  prepared.value = [];
  const source = project.manifest;
  const storage = project.storage;
  try {
    await project.save();
    const runtime = await loadPlayerRuntime();
    const results: CompileResult[] = [];
    const targets = [...selected.value].filter(target => target !== 'native' || desktop);
    if (targets.includes('native') && storage.kind !== 'tauri') throw new Error('Guarda primero la obra en una carpeta desde Studio de escritorio para crear el ejecutable.');
    for (const target of targets) {
      message.value = `Preparando ${TARGET_LABELS[target].toLowerCase()}…`;
      results.push(await compileFromStudio({ manifest: source, resolveAsset: project.resolveAsset, target, runtime }));
      if (storage !== project.storage || source !== project.manifest) throw new Error('La obra cambió durante la preparación. Vuelve a preparar la versión actual.');
    }
    const blocking = results.flatMap(result => result.blocking);
    if (results.some(result => !result.ok)) {
      voiceRepair.value = blocking.some(issue => issue.code === 'missing_narration');
      throw new Error([...new Set(blocking.map(issue => issue.message))].join(' ') || 'Hay escenas por resolver antes de preparar las versiones.');
    }
    pending.value = [...new Set(results.flatMap(result => result.missingAssets))];
    if (pending.value.length && !allowDraft.value) throw new Error('Faltan sonidos o imágenes. Aporta los recursos indicados o confirma un borrador con recursos de prueba.');
    const locations: string[] = [];
    for (const result of results) {
      const root = storage.kind === 'tauri' ? storage.location : null;
      const saved = result.target === 'native' && root ? await savePortableZip(result, root) : await saveExport(result, root);
      locations.push(saved.location);
      prepared.value.push(result.target);
    }
    location.value = locations.join('\n');
    completed.value = 'all';
    message.value = `${prepared.value.length} formatos preparados por separado. Cada uno conserva todas las decisiones y finales.`;
  } catch (error) {
    failed.value = true;
    message.value = `${error instanceof Error ? error.message : 'No se pudieron preparar las versiones.'}${prepared.value.length ? ` Ya se guardó: ${prepared.value.map(target => TARGET_LABELS[target]).join(', ')}.` : ''}`;
  } finally { busy.value = null; }
}
function repairAssets() { emit('close'); studio.assetsOpen = true; }
function repairVoice() { emit('close'); studio.narrationOpen = true; }
</script>

<template>
  <ExportDialog :busy="busy !== null" @close="emit('close')">
    <template #default="{ disabled }">
      <p class="mb-3 text-dv-muted">Se guarda tu trabajo antes de preparar el archivo. Exportar no publica la obra en internet.</p>
      <fieldset class="mb-4 space-y-3 border-b border-dv-border pb-4" :disabled="disabled || busy !== null">
        <legend class="font-semibold">Elige los formatos para compartir</legend>
        <p class="text-sm text-dv-muted">Puedes elegir uno, varios o los tres. Recibirás un ZIP independiente por formato, con todas las decisiones y finales.</p>
        <div class="flex flex-wrap gap-4">
          <label v-for="target in (['web', 'audio_drama', 'native'] as ExportTarget[])" :key="target" class="flex min-h-11 items-center gap-2"><input v-model="selected" type="checkbox" :value="target" :disabled="target === 'native' && !desktop" :data-testid="`export-select-${target}`" />{{ TARGET_LABELS[target] }}</label>
        </div>
        <p v-if="!desktop" class="text-xs text-dv-muted">El ejecutable se crea desde Studio de escritorio, para el sistema de ese equipo.</p>
        <button type="button" class="dv-btn-accent" data-testid="export-selected" :disabled="!selected.length" @click="runAll">{{ busy === 'all' ? 'Preparando formatos…' : 'Descargar formatos seleccionados' }}</button>
      </fieldset>
      <div class="grid gap-3 md:grid-cols-3" data-testid="export-targets">
        <article v-for="target in (['web', 'audio_drama', 'native'] as ExportTarget[])" :key="target" class="dv-pitch flex flex-col gap-2">
          <h3 class="font-semibold text-dv-accent-2">{{ TARGET_LABELS[target] }}</h3>
          <p class="flex-1 text-dv-muted">{{ DESCRIPTIONS[target] }}</p>
          <button
            v-if="target !== 'native' || desktop"
            type="button"
            class="dv-btn-accent self-start"
            :disabled="disabled || busy !== null"
            :data-testid="`export-${target}`"
            @click="run(target)"
          >{{ busy === target ? 'Preparando…' : target === 'web' ? 'Preparar web' : target === 'audio_drama' ? 'Preparar audio' : 'Crear aplicación' }}</button>
          <p v-else class="text-xs text-dv-muted">Disponible en la aplicación de escritorio de Duvarret Studio.</p>
        </article>
      </div>
      <p v-if="message" :role="failed ? 'alert' : 'status'" class="mt-3" :class="{ 'text-dv-danger': failed }" data-testid="export-message">{{ message }}</p>
      <button v-if="voiceRepair" type="button" class="dv-btn-accent mt-2" data-testid="export-repair-voice-file" @click="repairVoice">Restaurar las grabaciones de voz</button>
      <div v-if="pending.length" class="mt-3 space-y-2 text-sm" data-testid="export-pending">
        <p>{{ pending.length }} recursos sin aportar. Un borrador usará sonidos o imágenes de prueba.</p>
        <button type="button" class="dv-btn-ghost" @click="repairAssets">Revisar sonidos e imágenes</button>
        <label class="flex items-start gap-2"><input v-model="allowDraft" type="checkbox" data-testid="export-allow-draft" /> Exportar igualmente, con un tono de prueba o un marcador donde falte algo</label>
      </div>
      <section v-if="completed" class="mt-4 space-y-3 rounded-lg border border-dv-border p-4" aria-label="Cómo compartir la obra" data-testid="export-next-steps">
        <p class="whitespace-pre-line break-all text-sm">{{ completed === 'all' ? 'Archivos:' : 'Archivo:' }} {{ location }}</p>
        <p v-if="completed === 'all'">Comparte cada ZIP por separado. Publica Web o audio-drama en un servidor; para escritorio, extrae el ZIP y conserva juntos el programa y la carpeta obra.</p>
        <p v-else-if="completed === 'native'">Envía la carpeta completa, con el programa y la carpeta obra. El archivo de Windows no se abre en Android.</p>
        <p v-else>Para compartir un enlace, extrae el ZIP y publica su contenido en GitHub Pages o itch.io. Después envía la dirección de la página. Abrir index.html con doble clic puede impedir cargar el cuento.</p>
        <button v-if="desktop && project.storage.kind === 'tauri'" type="button" class="dv-btn-accent" data-testid="export-show-folder" @click="reveal">Abrir carpeta de publicaciones</button>
      </section>
    </template>
  </ExportDialog>
</template>
