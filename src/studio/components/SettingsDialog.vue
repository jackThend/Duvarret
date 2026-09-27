<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DEFAULT_MODELS, PROVIDER_LABELS, probeProvider, providerNeedsKey, type ProbeReport, type ProviderKind } from '@/core/agent';
import { THEMES, THEME_LABELS } from '@/core/project';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
const studio = useStudioStore();
const project = useProjectStore();
const kinds = Object.keys(PROVIDER_LABELS) as ProviderKind[];
const needsKey = computed(() => providerNeedsKey(studio.provider.kind));
const probing = ref(false);
const probe = ref<ProbeReport | null>(null);

function setKind(kind: ProviderKind) {
  studio.provider = { kind };
}

// Un resultado deja de valer en cuanto cambia la configuración.
watch(() => studio.provider, () => (probe.value = null), { deep: true });

/** Una vuelta real del co-director sobre una copia de la obra: no cambia nada. */
async function testProvider() {
  probing.value = true;
  probe.value = null;
  try {
    probe.value = await probeProvider(studio.orchestrator.provider, project.manifest, project.selectedNodeId ? { nodeId: project.selectedNodeId } : {});
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
        <legend class="dv-section-title">Cerebro del co-director</legend>
        <select class="dv-select w-full" :value="studio.provider.kind" data-testid="provider-kind" @change="setKind(($event.target as HTMLSelectElement).value as ProviderKind)">
          <option v-for="k in kinds" :key="k" :value="k">{{ PROVIDER_LABELS[k] }}</option>
        </select>
        <label v-if="studio.provider.kind !== 'local'" class="block">
          <span class="text-dv-muted">Modelo</span>
          <input v-model="studio.provider.model" class="dv-input w-full" :placeholder="DEFAULT_MODELS[studio.provider.kind]" />
        </label>
        <label v-if="needsKey" class="block">
          <span class="text-dv-muted">Clave personal</span>
          <input v-model="studio.provider.apiKey" type="password" autocomplete="off" class="dv-input w-full" data-testid="provider-key" />
          <span class="text-xs text-dv-muted">Se guarda solo en este dispositivo, nunca dentro de la obra.</span>
        </label>
        <label v-if="studio.provider.kind === 'ollama' || studio.provider.kind === 'openai'" class="block">
          <span class="text-dv-muted">Dirección del servicio (opcional)</span>
          <input v-model="studio.provider.baseUrl" class="dv-input w-full" :placeholder="studio.provider.kind === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'" />
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
      </fieldset>
    </div>
  </Modal>
</template>
