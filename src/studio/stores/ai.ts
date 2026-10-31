/** Preferencias públicas por capacidad. El servicio de credenciales conserva los secretos. */
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { AiProviderId } from '@/core/ai/types';
import { AI_PROVIDER_LABELS, DEFAULT_IMAGE_MODEL, DEFAULT_CLOUDFLARE_IMAGE_MODEL, DEFAULT_SPEECH_MODELS, DEFAULT_SPEECH_VOICES } from '@/core/ai/catalog';
import type { NarrationSelection } from '@/core/narration/plan';
import { credentialStatus, removeCredential, setCredential, setProviderEndpoint } from '../services/ai';

export const AI_SETTINGS_KEY = 'duvarret:ai-settings';
export { AI_PROVIDER_LABELS } from '@/core/ai/catalog';
const imageDefault = { provider: 'gemini' as const, model: DEFAULT_IMAGE_MODEL };
interface ImageSettings { provider: 'gemini' | 'cloudflare'; model: string; accountId?: string }
const speechDefault: NarrationSelection = { provider: 'kokoro', voice: 'ef_dora' };
const defaultsForVoice: Record<NarrationSelection['provider'], { model?: string; voice: string }> = {
  kokoro: { voice: 'ef_dora' },
  gemini: { model: DEFAULT_SPEECH_MODELS.gemini, voice: DEFAULT_SPEECH_VOICES.gemini },
  elevenlabs: { model: DEFAULT_SPEECH_MODELS.elevenlabs, voice: DEFAULT_SPEECH_VOICES.elevenlabs },
  compatible: { model: DEFAULT_SPEECH_MODELS.compatible, voice: DEFAULT_SPEECH_VOICES.compatible },
  openai: { model: DEFAULT_SPEECH_MODELS.openai, voice: DEFAULT_SPEECH_VOICES.openai },
};
export const useAiStore = defineStore('duvarret-ai', () => {
  let initial: Record<string, unknown> = {};
  try { initial = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) ?? '{}') as Record<string, unknown>; } catch { /* preferencias dañadas */ }
  const rawImage = initial.image as Partial<ImageSettings> | undefined;
  const image = ref<ImageSettings>({ ...imageDefault, ...(rawImage?.provider === 'cloudflare' ? { provider: 'cloudflare' as const, model: DEFAULT_CLOUDFLARE_IMAGE_MODEL } : {}), ...(rawImage?.model ? { model: String(rawImage.model) } : {}), ...(rawImage?.accountId ? { accountId: String(rawImage.accountId) } : {}) });
  const rawVoice = initial.speech as Partial<NarrationSelection> | undefined;
  const speech = ref<NarrationSelection>(rawVoice?.provider && rawVoice.provider in defaultsForVoice ? { provider: rawVoice.provider, ...defaultsForVoice[rawVoice.provider], ...(rawVoice.model ? { model: rawVoice.model } : {}), ...(rawVoice.voice ? { voice: rawVoice.voice } : {}) } : { ...speechDefault });
  const endpoints = ref<Partial<Record<AiProviderId, string>>>({});
  const configured = ref<Partial<Record<AiProviderId, boolean>>>({});
  const error = ref('');
  const ready = ref(false);
  watch([image, speech, endpoints], () => {
    // Selección explícita de campos: ni una migración legacy puede persistir apiKey aquí.
    try { localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({ image: { provider: image.value.provider, model: image.value.model, accountId: image.value.accountId }, speech: { provider: speech.value.provider, model: speech.value.model, voice: speech.value.voice }, endpoints: endpoints.value })); } catch { /* sin almacenamiento */ }
  }, { deep: true });
  async function refresh(provider: AiProviderId) {
    configured.value[provider] = (await credentialStatus(provider)).configured;
    return configured.value[provider] ?? false;
  }
  async function initialize() {
    if (ready.value) return;
    try {
      const rawEndpoints = initial.endpoints;
      if (rawEndpoints && typeof rawEndpoints === 'object') {
        for (const [provider, url] of Object.entries(rawEndpoints)) if (provider in AI_PROVIDER_LABELS && typeof url === 'string' && url) {
          if (provider === 'compatible' || provider === 'ollama') await setProviderEndpoint(provider, url);
          endpoints.value[provider as AiProviderId] = url;
        }
      }
      await Promise.all(Object.keys(AI_PROVIDER_LABELS).map(provider => refresh(provider as AiProviderId)));
      ready.value = true;
    } catch (cause) { error.value = cause instanceof Error ? cause.message : 'No se pudo consultar la configuración de IA.'; }
  }
  async function saveKey(provider: AiProviderId, key: string) {
    if (!key.trim()) throw new Error('Escribe una clave antes de guardarla.');
    await setCredential(provider, key.trim());
    await refresh(provider);
  }
  async function forgetKey(provider: AiProviderId) {
    await removeCredential(provider); configured.value[provider] = false;
  }
  async function saveEndpoint(provider: AiProviderId, url: string) {
    if (provider !== 'compatible' && provider !== 'ollama') throw new Error('Este proveedor usa su dirección oficial.');
    await setProviderEndpoint(provider, url.trim()); endpoints.value[provider] = url.trim();
  }
  function selectSpeech(provider: NarrationSelection['provider']) { speech.value = { provider, ...defaultsForVoice[provider] }; }
  function selectImage(provider: ImageSettings['provider']) { image.value = { provider, model: provider === 'cloudflare' ? DEFAULT_CLOUDFLARE_IMAGE_MODEL : DEFAULT_IMAGE_MODEL, accountId: image.value.accountId }; }
  async function requireKey(provider: AiProviderId) {
    if (provider === 'compatible' && endpoints.value.compatible) {
      const target = new URL(endpoints.value.compatible);
      if (['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) return;
    }
    if (!await refresh(provider)) throw new Error(`Añade tu clave de ${AI_PROVIDER_LABELS[provider]} en Preferencias → Conexiones de IA.`);
  }
  return { image, speech, endpoints, configured, ready, error, initialize, refresh, saveKey, forgetKey, saveEndpoint, selectSpeech, selectImage, requireKey };
});
