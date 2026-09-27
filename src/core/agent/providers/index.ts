import type { LlmProvider, ProviderConfig, ProviderKind } from '../types';
import { AnthropicProvider, DEFAULT_CLAUDE_MODEL } from './anthropic';
import { GeminiProvider } from './gemini';
import { OllamaProvider } from './ollama';
import { OpenAiProvider } from './openai';
import { LocalDirectorProvider } from '../localDirector';

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  local: 'Director local (sin conexión)',
  ollama: 'Modelo local (Ollama)',
  anthropic: 'Anthropic Claude',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
};

export const DEFAULT_MODELS: Record<ProviderKind, string> = {
  local: 'director-local',
  ollama: 'llama3.1',
  anthropic: DEFAULT_CLAUDE_MODEL,
  gemini: 'gemini-2.5-pro',
  openai: 'gpt-4o',
};

export function providerNeedsKey(kind: ProviderKind): boolean {
  return kind === 'anthropic' || kind === 'gemini' || kind === 'openai';
}

export function createProvider(config: ProviderConfig): LlmProvider {
  switch (config.kind) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
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
