import { newCallId, safeJsonObject, type CompletionRequest, type CompletionResponse, type LlmProvider, type ProviderConfig } from '../types';
import { toOpenAiMessages } from './openai';
import { postJson } from './http';

interface OllamaResponse {
  model?: string;
  done_reason?: string;
  message: { content: string; tool_calls?: { function: { name: string; arguments: unknown } }[] };
}

/** Modelos locales sin conexión (Llama, Mistral, Command-R…) vía Ollama — RNF-04. */
export class OllamaProvider implements LlmProvider {
  readonly kind = 'ollama' as const;
  readonly model: string;
  constructor(private readonly config: ProviderConfig) {
    this.model = config.model ?? 'llama3.1';
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const url = `${(this.config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '')}/api/chat`;
    const messages = toOpenAiMessages(request).map((m) => ({
      role: m.role,
      content: m.content ?? '',
      ...(m.tool_calls ? { tool_calls: m.tool_calls.map((c) => ({ function: { name: c.function.name, arguments: safeJsonObject(c.function.arguments) } })) } : {}),
    }));
    const data = await postJson<OllamaResponse>(
      this.config.fetch,
      this.kind,
      url,
      { model: this.model, stream: false, messages, tools: request.tools.map((t) => ({ type: 'function', function: t })) },
      {},
      request.signal,
    );
    const toolCalls = (data.message.tool_calls ?? []).map((c) => ({ id: newCallId('ollama'), name: c.function.name, arguments: safeJsonObject(c.function.arguments) }));
    return {
      content: data.message.content ?? '',
      toolCalls,
      stopReason: toolCalls.length ? 'tool_calls' : data.done_reason === 'length' ? 'length' : 'stop',
      ...(data.model ? { model: data.model } : {}),
    };
  }
}
