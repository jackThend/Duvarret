<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_MODELS, PROVIDER_LABELS, providerNeedsKey, type ProviderKind } from '@/core/agent';
import { THEMES, THEME_LABELS } from '@/core/project';
import { useStudioStore } from '../stores/studio';
import Modal from './Modal.vue';

const emit = defineEmits<{ close: [] }>();
const studio = useStudioStore();
const kinds = Object.keys(PROVIDER_LABELS) as ProviderKind[];
const needsKey = computed(() => providerNeedsKey(studio.provider.kind));

function setKind(kind: ProviderKind) {
  studio.provider = { kind };
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
      </fieldset>
    </div>
  </Modal>
</template>
