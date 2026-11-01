import { isTauri } from '@tauri-apps/api/core';
import type { FetchLike } from '@/core/agent/types';
import { decodeBase64, generateImageWith, generateSoundEffectWith, generateSpeechWith } from '@/core/ai/media';
import { isFreesoundPreview } from '@/core/assets/freesound';
import type { AiProviderId, GeneratedMedia, ImageGenerationRequest, SoundEffectRequest, SpeechGenerationRequest } from '@/core/ai/types';

// Solo la sesión web conserva temporalmente las claves en memoria; nunca localStorage ni obras.
const sessionKeys = new Map<AiProviderId, string>();
const sessionEndpoints = new Map<AiProviderId, string>();
export interface CredentialStatus { configured: boolean }
export async function openProviderDocs(provider: AiProviderId): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('ai_open_provider_docs', { provider });
    return;
  }
  const links: Record<AiProviderId, string> = {
    gemini: 'https://aistudio.google.com/apikey', cloudflare: 'https://dash.cloudflare.com/profile/api-tokens',
    elevenlabs: 'https://elevenlabs.io/docs/eleven-api/quickstart', openai: 'https://platform.openai.com/api-keys',
    anthropic: 'https://console.anthropic.com/settings/keys', zen: 'https://opencode.ai/auth', ollama: 'https://ollama.com/', compatible: 'https://openrouter.ai/settings/keys',
    freesound: 'https://freesound.org/apiv2/apply',
  };
  // Con noopener los navegadores pueden devolver null aunque abran la pestaña.
  window.open(links[provider], '_blank', 'noopener,noreferrer');
}

export async function setCredential(provider: AiProviderId, key: string): Promise<void> {
  if (!key.trim() || /[\r\n]/.test(key)) throw new Error('Introduce una clave válida.');
  if (!isTauri()) { sessionKeys.set(provider, key.trim()); return; }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ai_credential_set', { provider, key: key.trim() });
}
export async function credentialStatus(provider: AiProviderId): Promise<CredentialStatus> {
  if (!isTauri()) return { configured: sessionKeys.has(provider) };
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CredentialStatus>('ai_credential_status', { provider });
}
export async function removeCredential(provider: AiProviderId): Promise<void> {
  sessionKeys.delete(provider);
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ai_credential_remove', { provider });
}
export async function setProviderEndpoint(provider: 'compatible' | 'ollama', url: string): Promise<void> {
  const endpoint = new URL(url);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('La dirección del proveedor no debe contener claves, credenciales ni parámetros.');
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) throw new Error('Usa una dirección HTTPS; los modelos locales pueden usar HTTP en este equipo.');
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('ai_endpoint_set', { provider, url: endpoint.toString() });
  }
  sessionEndpoints.set(provider, endpoint.toString());
}

function authorization(provider: AiProviderId, key: string): Record<string, string> {
  if (provider === 'gemini') return { 'x-goog-api-key': key };
  if (provider === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  if (provider === 'elevenlabs') return { 'xi-api-key': key };
  if (provider === 'freesound') return { authorization: `Token ${key}` };
  return { authorization: `Bearer ${key}` };
}

const DEFAULT_ORIGINS: Partial<Record<AiProviderId, string>> = {
  openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta',
  elevenlabs: 'https://api.elevenlabs.io/v1', zen: 'https://opencode.ai/inference/openai/v1', ollama: 'http://localhost:11434',
  cloudflare: 'https://api.cloudflare.com/client/v4/accounts', freesound: 'https://freesound.org/apiv2',
};
function allowedWebUrl(provider: AiProviderId, input: string): string {
  const endpoint = new URL(sessionEndpoints.get(provider) ?? DEFAULT_ORIGINS[provider] ?? 'https://invalid.invalid/');
  const target = new URL(input);
  if (target.origin !== endpoint.origin || !(target.pathname === endpoint.pathname.replace(/\/$/, '') || target.pathname.startsWith(`${endpoint.pathname.replace(/\/$/, '')}/`)) || target.username || target.password || target.hash) throw new Error('La solicitud no corresponde al proveedor configurado.');
  if ([...target.searchParams.keys()].some(key => /^(key|api[_-]?key|token|access_token)$/i.test(key))) throw new Error('Las claves se envían de forma protegida, nunca en la dirección del proveedor.');
  return target.toString();
}

interface NativeResponse { status: number; headers: Record<string, string>; bodyBase64: string }

/** El renderer entrega la petición; el proceso nativo inyecta la clave cifrada, sin devolverla. */
export function providerFetch(provider: AiProviderId): FetchLike {
  return async (input, init = {}) => {
    init.signal?.throwIfAborted();
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      if (['content-type', 'accept', 'anthropic-version', 'anthropic-beta'].includes(key.toLowerCase())) headers[key] = value;
    });
    // Los previews de Freesound están en su CDN público: se descargan sin clave.
    const preview = provider === 'freesound' && (init.method ?? 'GET') === 'GET' && isFreesoundPreview(input);
    if (!isTauri()) {
      if (preview) return fetch(input, { ...init, redirect: 'error', headers });
      const key = sessionKeys.get(provider);
      const target = allowedWebUrl(provider, input);
      const local = provider === 'compatible' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(target).hostname);
      if (!key && provider !== 'ollama' && !local) throw new Error('Guarda tu clave en Ajustes antes de usar este proveedor.');
      return fetch(target, { ...init, redirect: 'error', headers: { ...headers, ...(key ? authorization(provider, key) : {}) } });
    }
    if (init.body !== undefined && typeof init.body !== 'string') throw new Error('La solicitud debe enviarse como texto JSON.');
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<NativeResponse>('ai_request', { request: { provider, url: input, method: init.method ?? 'GET', headers, body: init.body ?? null } });
    init.signal?.throwIfAborted();
    const data = decodeBase64(result.bodyBase64, 64 * 1024 * 1024);
    // Copia a ArrayBuffer propio para compatibilidad de Blob/Response con TS 5.9.
    return new Response(data.slice().buffer, { status: result.status, headers: result.headers });
  };
}

export async function generateImage(request: ImageGenerationRequest): Promise<GeneratedMedia> {
  const result = await generateImageWith(providerFetch(request.provider), request);
  // El navegador debe poder decodificar la ilustración antes de guardarla en la obra.
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(new Blob([result.data.slice().buffer], { type: result.mimeType })); }
    catch { throw new Error('La ilustración recibida no se puede abrir. Reintenta la generación.'); }
    bitmap.close();
  }
  return result;
}
export async function generateSpeech(request: SpeechGenerationRequest): Promise<GeneratedMedia> {
  const result = await generateSpeechWith(providerFetch(request.provider), request);
  if (typeof OfflineAudioContext !== 'undefined') {
    try {
      const decoded = await new OfflineAudioContext(1, 1, 24000).decodeAudioData(result.data.slice().buffer);
      if (!decoded.length || !decoded.duration) throw new Error('vacío');
    } catch { throw new Error('La grabación recibida no se puede reproducir. Reintenta la generación.'); }
  }
  return result;
}

export function generateSoundEffect(request: SoundEffectRequest): Promise<GeneratedMedia> {
  return generateSoundEffectWith(providerFetch('elevenlabs'), request);
}
