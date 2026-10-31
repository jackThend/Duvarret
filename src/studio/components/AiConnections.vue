<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { AI_PROVIDER_LABELS, CLOUD_USAGE_NOTICE, IMAGE_MODELS, CLOUDFLARE_IMAGE_MODELS } from '@/core/ai/catalog';
import type { AiProviderId } from '@/core/ai/types';
import { isTauri } from '@/core/lore/tauriDriver';
import { useAiStore } from '../stores/ai';

const ai = useAiStore();
const provider = ref<AiProviderId>('gemini');
const key = ref('');
const endpoint = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');
const providers = Object.entries(AI_PROVIDER_LABELS) as [AiProviderId, string][];
const native = isTauri();
const canEndpoint = computed(() => provider.value === 'compatible' || provider.value === 'ollama');
const imageModels = computed(() => ai.image.provider === 'cloudflare' ? CLOUDFLARE_IMAGE_MODELS : IMAGE_MODELS);
const providerLinks: Record<AiProviderId, string> = {
  gemini: 'https://aistudio.google.com/apikey', openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys', zen: 'https://opencode.ai/zen',
  elevenlabs: 'https://elevenlabs.io/app/settings/api-keys', cloudflare: 'https://dash.cloudflare.com/profile/api-tokens',
  ollama: 'https://ollama.com/download', compatible: 'https://lmstudio.ai/',
  freesound: 'https://freesound.org/apiv2/apply',
};
async function openProvider(event: Event) {
  if (!native) return;
  event.preventDefault();
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('ai_open_provider_docs', { provider: provider.value });
  } catch { error.value = `Abre esta dirección en tu navegador: ${providerLinks[provider.value]}`; }
}
onMounted(() => void ai.initialize());
async function save() {
  busy.value = true; error.value = message.value = '';
  try {
    if (canEndpoint.value && endpoint.value.trim()) await ai.saveEndpoint(provider.value, endpoint.value);
    if (key.value.trim()) await ai.saveKey(provider.value, key.value);
    else if (provider.value !== 'ollama') await ai.requireKey(provider.value);
    key.value = '';
    message.value = native ? 'Conexión guardada en este equipo. La misma clave se usa en las capacidades compatibles.' : 'Conexión disponible durante esta sesión. Al cerrar el navegador tendrás que introducir la clave de nuevo.';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
async function forget() {
  busy.value = true; error.value = message.value = '';
  try { await ai.forgetKey(provider.value); key.value = ''; message.value = 'Clave eliminada de este dispositivo.'; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
function choose() { key.value = ''; endpoint.value = ai.endpoints[provider.value] ?? ''; error.value = message.value = ''; void ai.refresh(provider.value).catch(() => undefined); }
</script>

<template>
  <fieldset class="space-y-3" data-testid="ai-connections">
    <legend class="dv-section-title">Conexiones de IA</legend>
    <p class="text-xs text-dv-muted">La voz local incluida funciona sin configurar nada. Para imágenes, asistencia o voces en la nube, conecta tu propio proveedor. Una clave de Gemini sirve para texto, imágenes y voz.</p>
    <p class="text-xs text-dv-muted">{{ CLOUD_USAGE_NOTICE }}</p>
    <p v-if="!native" class="text-xs text-dv-muted">En el navegador las claves duran solo esta sesión. Algunos servicios bloquean conexiones de navegador; usa la aplicación de escritorio en ese caso.</p>
    <label class="block">Proveedor
      <select v-model="provider" class="dv-select mt-1 w-full" data-testid="ai-connection-provider" @change="choose">
        <option v-for="[id,label] in providers" :key="id" :value="id">{{ label }}</option>
      </select>
    </label>
    <p role="status" class="text-xs text-dv-muted" data-testid="ai-key-status">{{ provider === 'ollama' ? 'Ollama usa su instalación local.' : ai.configured[provider] ? 'Clave configurada. Nunca se incluye en las obras exportadas.' : 'Sin clave configurada para este proveedor.' }}</p>
    <a :href="providerLinks[provider]" target="_blank" rel="noopener noreferrer" class="dv-link inline-block" data-testid="ai-provider-link" @click="openProvider">{{ provider === 'ollama' || provider === 'compatible' ? 'Abrir sitio del proveedor' : 'Obtener mi clave en el proveedor' }}</a>
    <p v-if="provider === 'zen'" class="text-xs text-dv-muted">OpenCode Zen necesita su propia clave de API. Sus modelos gratuitos y límites dependen del catálogo vigente de tu cuenta.</p>
    <p v-if="provider === 'openai'" class="text-xs text-dv-muted">Una suscripción a ChatGPT no incluye automáticamente saldo para la API de OpenAI.</p>
    <p v-if="provider === 'freesound'" class="text-xs text-dv-muted">Gratis con una cuenta de Freesound: pide una clave de API y pégala aquí. Duvarret solo busca sonidos CC0, que puedes usar en tus obras sin pedir permiso ni acreditar.</p>
    <p v-if="provider === 'cloudflare'" class="text-xs text-dv-muted">Crea un token con permiso de Workers AI para tu cuenta. El identificador de cuenta se configura debajo, en Ilustraciones.</p>
    <label v-if="provider !== 'ollama'" class="block">{{ ai.configured[provider] ? 'Sustituir clave personal' : 'Clave personal' }}
      <input v-model="key" type="password" autocomplete="off" class="dv-input mt-1 w-full" data-testid="provider-key" placeholder="Pega tu clave; no se volverá a mostrar" />
    </label>
    <label v-if="canEndpoint" class="block">Dirección del servicio
      <input v-model="endpoint" class="dv-input mt-1 w-full" data-testid="ai-endpoint" :placeholder="provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1 · LM Studio, o servicio HTTPS'" />
    </label>
    <p v-if="provider === 'compatible'" class="text-xs text-dv-muted">Un servidor local de LM Studio puede funcionar sin clave. Inicia su servidor compatible y guarda su dirección; para servicios externos usa su clave y modelo.</p>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="dv-btn-accent" :disabled="busy" data-testid="ai-save-key" @click="save">{{ busy ? 'Guardando…' : 'Guardar conexión' }}</button>
      <button v-if="ai.configured[provider]" type="button" class="dv-btn-ghost" :disabled="busy" data-testid="ai-forget-key" @click="forget">Eliminar clave</button>
    </div>
    <p v-if="message" role="status" data-testid="ai-connection-message">{{ message }}</p>
    <p v-if="error || ai.error" role="alert" class="text-dv-danger" data-testid="ai-connection-error">{{ error || ai.error }}</p>
    <div class="space-y-2 border-t border-dv-border pt-3">
      <p class="font-medium">Ilustraciones en la nube</p>
      <label class="block text-xs">Proveedor de imágenes
        <select v-model="ai.image.provider" class="dv-select mt-1 w-full" data-testid="ai-image-provider" @change="ai.selectImage(ai.image.provider)"><option value="gemini">Gemini · facturación del proveedor</option><option value="cloudflare">Cloudflare Workers AI · cuota gratuita limitada</option></select>
      </label>
      <label v-if="ai.image.provider === 'cloudflare'" class="block text-xs">Identificador de cuenta de Cloudflare
        <input v-model="ai.image.accountId" class="dv-input mt-1 w-full" data-testid="ai-image-account" placeholder="Account ID de tu cuenta, 32 caracteres" />
      </label>
      <label class="block text-xs">Modelo de imagen
        <input v-model="ai.image.model" list="ai-image-models" class="dv-input mt-1 w-full" data-testid="ai-image-model" />
      </label>
      <datalist id="ai-image-models"><option v-for="model in imageModels" :key="model.id" :value="model.id">{{ model.label }}</option></datalist>
      <p v-if="ai.image.provider === 'cloudflare'" class="text-xs text-dv-muted">Guarda un token de Cloudflare en la conexión del mismo nombre. La cuota gratuita de Workers AI es limitada y compartida con otros usos de tu cuenta; no es generación ilimitada.</p>
      <p class="text-xs text-dv-muted">Elige una sugerencia o escribe el identificador de un modelo compatible de tu cuenta. Las imágenes se generan en la nube; no se descargan modelos de imagen al equipo.</p>
    </div>
  </fieldset>
</template>
