<script setup lang="ts">
import { computed, provide, ref } from 'vue';
import { ACTION_LABELS, DIRECTION_LABELS, NARRATIVE_SCENES, defaultNarrativeParams, isNarrativeType, validateNarrativeParams, type NarrativeType, type SceneField } from '@/core/gameplay/narrative';
import { ManifestEditor } from '@/core/agent/manifestEditor';
import { VisualStyleSchema, VISUAL_STYLES, VISUAL_ATMOSPHERES } from '@/core/visual/style';
import { RUNTIME_SERVICES } from '@/runtime/services';
import { Announcer } from '@/runtime/screenless/announcer';
import ModuleSandbox from '@/runtime/modules/ModuleSandbox.vue';
import { GameplayOverlaySchema, type Outcome } from '@/core/manifest';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import Modal from './Modal.vue';
import VisualImagePicker from './VisualImagePicker.vue';

const props = defineProps<{ initialType?: string | null }>();
const emit = defineEmits<{ close: [] }>();
const project = useProjectStore(), studio = useStudioStore();
const identity = project.workIdentity(), nodeId = project.selectedNodeId, previous = project.selectedNode?.gameplay_overlay;
const type = ref<NarrativeType>(isNarrativeType(props.initialType || '') ? props.initialType as NarrativeType : previous && isNarrativeType(previous.type) ? previous.type : 'radio_tuning');
const title = ref(previous?.title || NARRATIVE_SCENES.find(s => s.type === type.value)!.title);
const parameters = ref<Record<string, unknown>>(previous?.type === type.value ? { ...defaultNarrativeParams(type.value), ...previous.parameters } : defaultNarrativeParams(type.value));
const definition = computed(() => NARRATIVE_SCENES.find(s => s.type === type.value)!);
const profile = ref(VisualStyleSchema.parse(project.manifest.global_settings.visual_style ?? {}));
const imageDescription = ref(previous?.parameters.artwork_alt as string || project.selectedNode?.title || 'Ilustración de la escena');
const artwork = ref(typeof previous?.parameters.artwork === 'string' ? previous.parameters.artwork : '');
const mandatory = ref(previous?.is_mandatory_to_advance ?? true), replace = ref(false), busy = ref(false), imageBusy = ref(false), error = ref(''), message = ref('');
const needsReplace = computed(() => !!previous && previous.type !== type.value);
const outcomeForm = (outcome?: Outcome) => ({ transition: outcome?.transition_to_node || '', flags: outcome?.grant_flags.join(', ') || '', grant: [...outcome?.grant_items || []], consume: [...outcome?.consume_items || []] });
const success = ref(outcomeForm(previous?.on_success)), failure = ref(outcomeForm(previous?.on_failure));
const preview = ref<ReturnType<typeof GameplayOverlaySchema.parse> | null>(null), previewKey = ref(0), previewResult = ref('');
provide(RUNTIME_SERVICES, { audio: null, announcer: new Announcer(), resolveAsset: project.resolveAsset });
function checkWork() { if (project.workIdentity() !== identity || project.selectedNodeId !== nodeId || !nodeId) throw new Error('La obra o escena cambió. Abre de nuevo el configurador.'); }
function switchType() { parameters.value = defaultNarrativeParams(type.value); title.value = definition.value.title; preview.value = null; replace.value = false; error.value = message.value = ''; }
function fieldValue(field: SceneField) { const value = parameters.value[field.key]; return Array.isArray(value) ? value.join(field.kind === 'numbers' ? ', ' : '\n') : String(value ?? ''); }
function setField(field: SceneField, raw: string | boolean) {
  if (field.kind === 'boolean') parameters.value[field.key] = raw;
  else if (field.kind === 'number') parameters.value[field.key] = raw === '' ? NaN : Number(raw);
  else if (field.kind === 'lines') { parameters.value[field.key] = String(raw).split('\n').map(s => s.trim()).filter(Boolean); if (field.key === 'turns') { const n = (parameters.value.turns as string[]).length; parameters.value.best_actions = Array.from({length:n},(_,i) => (parameters.value.best_actions as string[])[i] || 'wait'); } }
  else if (field.kind === 'numbers') parameters.value[field.key] = String(raw).split(/[,\s]+/).filter(Boolean).map(Number);
  else parameters.value[field.key] = raw;
}
function outcome(form: ReturnType<typeof outcomeForm>, original?: Outcome) { return { ...original, grant_flags: form.flags.split(',').map(s => s.trim()).filter(Boolean), grant_items: [...form.grant], consume_items: [...form.consume], transition_to_node: form.transition || undefined }; }
function configuration() {
  const clean = validateNarrativeParams(type.value, { ...parameters.value, artwork: artwork.value, artwork_alt: imageDescription.value });
  return GameplayOverlaySchema.parse({ type: type.value, title: title.value.trim() || definition.value.title, parameters: clean, is_mandatory_to_advance: mandatory.value, on_success: outcome(success.value, previous?.on_success), on_failure: outcome(failure.value, previous?.on_failure) });
}
function tryScene() { error.value = ''; try { checkWork(); preview.value = configuration(); previewResult.value = ''; previewKey.value++; } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); } }
async function save() {
  if (busy.value || imageBusy.value) return;
  error.value = message.value = ''; busy.value = true;
  try {
    checkWork(); if (needsReplace.value && !replace.value) throw new Error('Confirma la sustitución del mecanismo existente o utiliza otra escena.');
    const overlay = configuration(), editor = new ManifestEditor(project.manifest);
    editor.patchManifest({ global_settings: { visual_style: profile.value } });
    editor.patchNode(nodeId!, { gameplay_overlay: undefined });
    editor.patchNode(nodeId!, { gameplay_overlay: overlay });
    project.applyDraft(editor.current); await project.save(); studio.previewNonce++;
    message.value = 'Escena jugable y sus resultados guardados. Puedes deshacer la configuración.';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
</script>

<template>
  <Modal title="Escenas jugables" wide :dismissible="!busy && !imageBusy" @close="emit('close')">
    <div class="space-y-5 text-sm" data-testid="playable-scene-dialog">
      <p class="text-dv-muted">Acciones que cuentan parte de tu historia. Configura sus pistas y decide qué significa cada resultado; también puedes dejar que el lector abandone y siga por otro camino.</p>
      <fieldset :disabled="busy || imageBusy" class="space-y-4">
        <label class="block">Tipo de escena<select v-model="type" class="dv-select mt-1 w-full" data-testid="playable-type" @change="switchType"><option v-for="scene in NARRATIVE_SCENES" :key="scene.type" :value="scene.type">{{ scene.title }}</option></select></label>
        <p class="font-prose text-base text-dv-accent-2">{{ definition.when }}</p>
        <label class="block">Título<input v-model="title" class="dv-input mt-1 w-full" data-testid="playable-title" /></label>
        <label class="block">Instrucciones y pistas para el lector<textarea :value="String(parameters.instructions || '')" class="dv-input mt-1 w-full" rows="3" data-testid="playable-instructions" @input="parameters.instructions = ($event.target as HTMLTextAreaElement).value"></textarea></label>
        <div class="grid gap-4 sm:grid-cols-2">
          <label v-for="field in definition.fields.filter(f => !['actions','directions'].includes(f.kind))" :key="field.key" class="block" :class="['lines','text'].includes(field.kind) ? 'sm:col-span-2' : ''">{{ field.label }}
            <input v-if="field.kind === 'boolean'" type="checkbox" :checked="!!parameters[field.key]" class="ml-2" :data-testid="`config-${field.key}`" @change="setField(field,($event.target as HTMLInputElement).checked)" />
            <textarea v-else-if="field.kind === 'lines' || field.kind === 'text'" :value="fieldValue(field)" rows="3" class="dv-input mt-1 w-full" :data-testid="`config-${field.key}`" @input="setField(field,($event.target as HTMLTextAreaElement).value)"></textarea>
            <input v-else :type="field.kind === 'number' ? 'number' : 'text'" :min="field.min" :max="field.max" :value="fieldValue(field)" class="dv-input mt-1 w-full" :data-testid="`config-${field.key}`" @input="setField(field,($event.target as HTMLInputElement).value)" />
          </label>
        </div>
        <div v-if="type === 'voice_negotiation'" class="space-y-2"><h3 class="font-semibold">Respuestas que favorecen la confianza</h3><label v-for="(line,i) in parameters.turns as string[]" :key="i" class="block">{{ i+1 }} · {{ line }}<select v-model="(parameters.best_actions as string[])[i]" class="dv-select mt-1 w-full" :data-testid="`config-action-${i}`"><option v-for="(label,value) in ACTION_LABELS" :key="value" :value="value">{{ label }}</option></select></label></div>
        <div v-if="type === 'sound_trail'" class="space-y-2"><h3 class="font-semibold">Tramos del recorrido</h3><label v-for="(_,i) in parameters.directions as string[]" :key="i" class="flex items-center gap-2">Tramo {{ i+1 }}<select v-model="(parameters.directions as string[])[i]" class="dv-select" :data-testid="`config-direction-${i}`"><option v-for="(label,value) in DIRECTION_LABELS" :key="value" :value="value">{{ label }}</option></select><button type="button" class="dv-btn-ghost" :disabled="(parameters.directions as string[]).length <= 2" @click="(parameters.directions as string[]).splice(i,1)">Quitar</button></label><button type="button" class="dv-btn-ghost" :disabled="(parameters.directions as string[]).length >= 8" @click="(parameters.directions as string[]).push('front')">Añadir tramo</button></div>
        <label v-if="!['voice_negotiation','surface_rubbing','burden_balance','photo_development'].includes(type)" class="block">Intentos antes de aceptar otro resultado<input v-model.number="parameters.max_attempts" type="number" min="1" max="20" class="dv-input mt-1 w-24" data-testid="config-max_attempts" /></label>
        <p v-else class="text-xs text-dv-muted">Aceptar el reparto, detener el calco o la fotografía, y terminar la conversación son decisiones definitivas de esta escena.</p>
        <label class="flex items-center gap-2"><input v-model="mandatory" type="checkbox" data-testid="playable-mandatory" /> Resolver o abandonar la escena antes de continuar</label>
      </fieldset>
      <details class="space-y-3" data-testid="playable-images"><summary class="cursor-pointer font-semibold">Imágenes y estilo · opcionales</summary><p class="text-xs text-dv-muted">Todas las escenas funcionan con representación por código. Puedes añadir una ilustración propia, reutilizar Mis recursos o generar con tu clave. En calcos, fotografías y pliegues, la imagen forma parte del mecanismo.</p>
        <div class="grid gap-3 sm:grid-cols-2"><label>Aspecto<select v-model="profile.style" class="dv-select mt-1 w-full"><option v-for="(label,value) in VISUAL_STYLES" :key="value" :value="value">{{ label }}</option></select></label><label>Atmósfera<select v-model="profile.atmosphere" class="dv-select mt-1 w-full"><option v-for="(label,value) in VISUAL_ATMOSPHERES" :key="value" :value="value">{{ label }}</option></select></label></div><label class="block">Descripción de la ilustración<input v-model="imageDescription" class="dv-input mt-1 w-full" /></label>
        <VisualImagePicker v-model="artwork" role="puzzle" label="Ilustración de la escena" :description="imageDescription" :profile="profile" @busy="imageBusy = $event" />
        <button type="button" class="dv-btn-ghost" :disabled="imageBusy" @click="artwork = ''">Usar solo representación por código</button>
      </details>
      <fieldset v-for="entry in [{ key:'success', label:'Resultado previsto', form:success },{ key:'failure', label:'Otro resultado, error o abandono', form:failure }]" :key="entry.key" :disabled="busy || imageBusy" class="space-y-3 border-t border-dv-border pt-4">
        <legend class="font-semibold">{{ entry.label }}</legend>
        <label class="block">Texto del resultado<textarea :value="String(parameters[entry.key === 'success' ? 'success_text' : 'failure_text'] || '')" class="dv-input mt-1 w-full" :data-testid="`playable-${entry.key}-text`" @input="parameters[entry.key === 'success' ? 'success_text' : 'failure_text'] = ($event.target as HTMLTextAreaElement).value"></textarea></label>
        <label class="block">Continuar en<select v-model="entry.form.transition" class="dv-select mt-1 w-full" :data-testid="`playable-${entry.key}-next`"><option value="">Permanecer y usar los caminos de la escena</option><option v-for="node in project.nodes.filter(n => n.node_id !== nodeId)" :key="node.node_id" :value="node.node_id">{{ node.title || node.node_id }}</option></select></label>
        <label class="block">Marcas que se activan (separadas por comas)<input v-model="entry.form.flags" class="dv-input mt-1 w-full" :data-testid="`playable-${entry.key}-flags`" /></label>
        <div v-if="project.items.length" class="grid gap-3 sm:grid-cols-2"><label>Objetos que entrega<select v-model="entry.form.grant" multiple class="dv-select mt-1 w-full" :aria-label="`Objetos que entrega: ${entry.label}`"><option v-for="item in project.items" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label>Objetos que consume<select v-model="entry.form.consume" multiple class="dv-select mt-1 w-full" :aria-label="`Objetos que consume: ${entry.label}`"><option v-for="item in project.items" :key="item.id" :value="item.id">{{ item.name }}</option></select></label></div>
      </fieldset>
      <label v-if="needsReplace" class="block rounded border border-dv-border p-3" role="alert"><input v-model="replace" type="checkbox" data-testid="playable-replace" /> Sustituir el mecanismo que ya tiene esta escena. Sus resultados se conservan salvo los cambios que haga aquí.</label>
      <details class="space-y-3"><summary class="cursor-pointer font-semibold">Adaptación narrativa para audio-drama sin pantalla</summary><p class="text-xs text-dv-muted">El audio-drama ofrece dos decisiones narrativas en lugar de simular pliegues, arrastre o revelado visual. Redacta aquí la situación y las intenciones de ambas opciones; aplicarán los resultados configurados arriba.</p><label v-for="field in [{key:'audio_prompt',label:'Situación narrada'},{key:'audio_success_option',label:'Primera decisión'},{key:'audio_failure_option',label:'Segunda decisión'}]" :key="field.key" class="block">{{ field.label }}<textarea :value="String(parameters[field.key] || '')" class="dv-input mt-1 w-full" :data-testid="`config-${field.key}`" @input="parameters[field.key] = ($event.target as HTMLTextAreaElement).value"></textarea></label></details>
      <div class="flex flex-wrap gap-2"><button type="button" class="dv-btn-ghost" :disabled="busy || imageBusy" data-testid="playable-preview" @click="tryScene">Probar configuración</button><button type="button" class="dv-btn-accent" :disabled="busy || imageBusy" data-testid="playable-save" @click="save">Aplicar y guardar</button></div>
      <section v-if="preview" class="rounded border border-dv-border p-3" aria-label="Prueba aislada" data-testid="playable-preview-stage"><p class="mb-3 text-xs text-dv-muted">Prueba aislada: las recompensas y salidas no afectan a la obra.</p><ModuleSandbox :key="previewKey" :overlay="preview" @resolve="previewResult = $event ? 'Resultado previsto' : 'Otro resultado o abandono'" /><p v-if="previewResult" role="status" data-testid="playable-preview-result">{{ previewResult }}</p></section>
      <p v-if="message" role="status" data-testid="playable-saved">{{ message }}</p><p v-if="error" role="alert" class="text-dv-danger" data-testid="playable-error">{{ error }}</p>
    </div>
  </Modal>
</template>
