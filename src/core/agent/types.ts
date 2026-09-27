/**
 * Contrato agnóstico de modelos de lenguaje basado en llamadas a herramientas (esquema OpenAI).
 * Cualquier cerebro (Gemini, Claude, GPT o un modelo local vía Ollama) se enchufa detrás de
 * `LlmProvider` sin alterar el resto de Duvarret (RF-13).
 */

export type JsonSchema = Record<string, unknown>;

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema de los argumentos (formato `parameters` de OpenAI). */
  parameters: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      toolCalls?: ToolCall[];
      /** Contenido nativo del proveedor (p. ej. bloques de pensamiento) para reenviarlo intacto. */
      providerContent?: unknown;
      provider?: ProviderKind;
    }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

/** Contexto estructurado de la escena (los proveedores remotos lo reciben como texto de sistema). */
export interface DirectorContext {
  nodeId?: string;
  nodeText?: string;
  nodeTitle?: string;
  characters?: string[];
  items?: string[];
}

export interface CompletionRequest {
  messages: ChatMessage[];
  tools: ToolSpec[];
  context?: DirectorContext;
  signal?: AbortSignal;
}

export type StopReason = 'stop' | 'tool_calls' | 'length' | 'refusal';

export interface CompletionResponse {
  content: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  providerContent?: unknown;
  model?: string;
}

export type ProviderKind = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'local';

export interface LlmProvider {
  readonly kind: ProviderKind;
  readonly model: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProviderConfig {
  kind: ProviderKind;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  maxTokens?: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

let callCounter = 0;
export const newCallId = (prefix = 'call') => `${prefix}_${Date.now().toString(36)}_${(++callCounter).toString(36)}`;

export function safeJsonObject(text: unknown): Record<string, unknown> {
  if (text && typeof text === 'object' && !Array.isArray(text)) return text as Record<string, unknown>;
  if (typeof text !== 'string') return {};
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
