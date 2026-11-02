import type { AiProviderId, ModelOption, SpeechProvider } from './types';

/** Sugerencias editables, verificadas el 20-10-2026; acceso y precio dependen del proveedor. */
export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini', ollama: 'Ollama local',
  zen: 'OpenCode Zen', compatible: 'Proveedor compatible', elevenlabs: 'ElevenLabs',
  cloudflare: 'Cloudflare Workers AI', freesound: 'Freesound · banco libre de sonidos',
};
// https://ai.google.dev/gemini-api/docs/image-generation
export const IMAGE_MODELS: ModelOption[] = [
  { id: 'gemini-nano-banana-2.1', label: 'Nano Banana 2.1 · equilibrado' },
  { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite · rápido' },
  { id: 'gemini-3-pro-image', label: 'Nano Banana Pro · detalle' },
];
export const DEFAULT_IMAGE_MODEL = 'gemini-nano-banana-2.1';
// https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
export const DEFAULT_CLOUDFLARE_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const CLOUDFLARE_IMAGE_MODELS: ModelOption[] = [{ id: DEFAULT_CLOUDFLARE_IMAGE_MODEL, label: 'FLUX.1 schnell · cuota gratuita limitada' }];
// https://ai.google.dev/gemini-api/docs/speech-generation
// https://elevenlabs.io/docs/api-reference/text-to-speech/convert
// https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
export const SPEECH_MODELS: Record<SpeechProvider, ModelOption[]> = {
  gemini: [{ id: 'gemini-3.8-flash-tts', label: 'Gemini Flash TTS' }, { id: 'gemini-3.8-flash-lite-tts', label: 'Gemini Flash Lite TTS' }],
  elevenlabs: [{ id: 'eleven_multilingual_v2', label: 'Eleven Multilingual v2' }],
  openai: [{ id: 'gpt-4o-mini-tts', label: 'GPT-4o mini TTS' }],
  compatible: [],
};
export const DEFAULT_SPEECH_MODELS: Record<SpeechProvider, string> = {
  gemini: 'gemini-3.8-flash-tts', elevenlabs: 'eleven_multilingual_v2', openai: 'gpt-4o-mini-tts', compatible: '',
};
export const DEFAULT_SPEECH_VOICES: Record<SpeechProvider, string> = { gemini: 'Kore', elevenlabs: '', openai: 'coral', compatible: '' };
export const CLOUD_USAGE_NOTICE = 'Usa tu propia clave. El proveedor puede cobrar por generación y aplicar límites; las cuotas gratuitas y los modelos pueden cambiar.';
// Solo modelos del endpoint chat/completions; no Responses ni SystemOne.
// https://opencode.ai/v2/docs/console/models/
export const ZEN_CHAT_MODELS: ModelOption[] = [
  { id: 'big-pickle', label: 'Big Pickle' }, { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
  { id: 'glm-5.3-flash', label: 'GLM 5.3 Flash' }, { id: 'exo-free', label: 'Exo Free · disponibilidad del proveedor' },
];
