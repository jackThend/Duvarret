import type { LlmProvider, ProviderConfig, ProviderKind } from '../types';
import { AnthropicProvider, DEFAULT_CLAUDE_MODEL } from './anthropic';
import { GeminiProvider } from './gemini';
import { OllamaProvider } from './ollama';
import { OpenAiProvider } from './openai';
import { LocalDirectorProvider } from '../localDirector';

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  local: 'Asistente básico sin conexión',
  ollama: 'Modelo local (Ollama)',
  anthropic: 'Anthropic Claude',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  zen: 'OpenCode Zen (chat compatible)',
  compatible: 'Proveedor compatible (avanzado)',
};

export const DEFAULT_MODELS: Record<ProviderKind, string> = {
  local: 'director-local',
  ollama: 'llama3.1',
  anthropic: DEFAULT_CLAUDE_MODEL,
  gemini: 'gemini-3.5-flash-lite',
  openai: 'gpt-4o',
  zen: 'big-pickle',
  compatible: '',
};

export function providerNeedsKey(kind: ProviderKind): boolean {
  return kind === 'anthropic' || kind === 'gemini' || kind === 'openai' || kind === 'zen' || kind === 'compatible';
}

export function createProvider(config: ProviderConfig): LlmProvider {
  switch (config.kind) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
    case 'zen':
    case 'compatible':
      return new OpenAiProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      return new LocalDirectorProvider();
  }
}

export { AnthropicProvider, GeminiProvider, OllamaProvider, OpenAiProvider, LocalDirectorProvider };
