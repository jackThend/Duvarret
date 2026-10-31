<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DEFAULT_MODELS, PROVIDER_LABELS, probeProvider, providerNeedsKey, type ProbeReport, type ProviderKind } from '@/core/agent';
import { THEMES, THEME_LABELS } from '@/core/project';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import Modal from './Modal.vue';
import AiConnections from './AiConnections.vue';
import { useAiStore } from '../stores/ai';

const emit = defineEmits<{ close: [] }>();
const studio = useStudioStore();
const project = useProjectStore();
const ai = useAiStore();
const kinds = Object.keys(PROVIDER_LABELS) as ProviderKind[];
const needsKey = computed(() => providerNeedsKey(studio.provider.kind));
const probing = ref(false);
const probe = ref<ProbeReport | null>(null);
const probeError = ref('');

function setKind(kind: ProviderKind) {
  studio.provider = { kind };
}

// Un resultado deja de valer en cuanto cambia la configuración.
watch(() => studio.provider, () => (probe.value = null), { deep: true });

/** Una vuelta real del co-director sobre una copia de la obra: no cambia nada. */
async function testProvider() {
  probing.value = true;
  probe.value = null;
  probeError.value = '';
  try {
    await studio.ensureProviderReady();
    if (needsKey.value && studio.provider.kind !== 'local') await ai.requireKey(studio.provider.kind);
    probe.value = await probeProvider(studio.orchestrator.provider, project.manifest, project.selectedNodeId ? { nodeId: project.selectedNodeId } : {});
  } catch (cause) {
    probeError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    probing.value = false;
  }
}
</script>

<template>
  <Modal title="Preferencias" @close="emit('close')">
    <div class="space-y-5 text-sm" data-testid="settings">
      <fieldset class="space-y-2">
        <legend class="dv-section-title">Tema</legend>
        <label v-for="t in THEMES" :key="t" class="flex items-center gap-2">
          <input v-model="studio.theme" type="radio" name="theme" :value="t" :data-testid="`theme-${t}`" /> {{ THEME_LABELS[t] }}
        </label>
      </fieldset>
      <fieldset class="space-y-2">
        <legend class="dv-section-title">Asistente de escritura</legend>
        <p class="text-xs text-dv-muted">Es opcional: puedes escribir, narrar y exportar sin configurar un servicio de IA.</p>
        <p v-if="studio.provider.kind === 'local'" class="text-xs text-dv-muted">El asistente básico usa reglas para sugerir recursos; no incluye un modelo de lenguaje. Para conversar con IA elige un proveedor, o conecta tu modelo de Ollama o LM Studio. La voz natural local sí está incluida.</p>
        <select class="dv-select w-full" :value="studio.provider.kind" data-testid="provider-kind" @change="setKind(($event.target as HTMLSelectElement).value as ProviderKind)">
          <option v-for="k in kinds" :key="k" :value="k">{{ PROVIDER_LABELS[k] }}</option>
        </select>
        <label v-if="studio.provider.kind !== 'local'" class="block">
          <span class="text-dv-muted">Modelo</span>
          <input v-model="studio.provider.model" class="dv-input w-full" :placeholder="DEFAULT_MODELS[studio.provider.kind]" />
        </label>
        <p v-if="needsKey" class="text-xs text-dv-muted">Usa la clave guardada para este proveedor en Conexiones de IA, más abajo.</p>
        <label v-if="studio.provider.kind === 'ollama' || studio.provider.kind === 'compatible'" class="block">
          <span class="text-dv-muted">Dirección del servicio (opcional)</span>
          <input :value="studio.serviceEndpoint" class="dv-input w-full" :placeholder="studio.provider.kind === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'" @change="ai.saveEndpoint(studio.provider.kind as 'ollama' | 'compatible', ($event.target as HTMLInputElement).value).catch(error => probeError = String(error))" />
        </label>
        <p v-if="studio.provider.kind === 'local' || studio.provider.kind === 'ollama'" class="text-xs text-dv-muted">Funciona sin conexión a internet.</p>
        <div class="flex items-center gap-3 pt-1">
          <button type="button" class="dv-btn-ghost" :disabled="probing" data-testid="probe-provider" @click="testProvider">{{ probing ? 'Probando…' : 'Probar conexión' }}</button>
          <span class="text-xs text-dv-muted">Pide al co-director que sitúe un sonido de prueba; la obra no cambia.</span>
        </div>
        <div v-if="probe" class="dv-margin-note space-y-1" role="status" data-testid="probe-result">
          <p class="font-medium">{{ probe.ok ? 'El co-director funciona con este proveedor.' : 'El proveedor no superó la prueba.' }}</p>
          <ul class="space-y-0.5 text-xs">
            <li v-for="c in probe.checks" :key="c.id" data-testid="probe-check" :class="c.ok ? '' : 'text-dv-danger'">
              {{ c.ok ? '✓' : '✗' }} {{ c.label }}<template v-if="c.detail && !c.ok"> — {{ c.detail }}</template>
            </li>
          </ul>
          <p class="text-xs text-dv-muted">{{ probe.model }} · {{ (probe.latencyMs / 1000).toFixed(1) }} s</p>
        </div>
        <p v-if="probeError || studio.credentialError" role="alert" class="text-dv-danger">{{ probeError || studio.credentialError }}</p>
      </fieldset>
      <AiConnections />
      <fieldset class="space-y-2">
        <legend class="dv-section-title">Sonido 3D</legend>
        <div class="flex items-center gap-3">
          <button type="button" class="dv-btn-ghost" data-testid="open-listening" @click="studio.listeningOpen = true; emit('close')">Prueba de escucha</button>
          <span class="text-xs text-dv-muted">Con auriculares: ¿distingues delante, detrás, izquierda y derecha?</span>
        </div>
      </fieldset>
    </div>
  </Modal>
</template>
