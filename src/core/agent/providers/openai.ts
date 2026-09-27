import { newCallId, safeJsonObject, type CompletionRequest, type CompletionResponse, type LlmProvider, type ProviderConfig } from '../types';
import { contextAsText, postJson } from './http';

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface OpenAiResponse {
  model?: string;
  choices: { finish_reason: string; message: OpenAiMessage }[];
}

/** Convierte la conversación al formato de chat de OpenAI (compartido con vLLM y compatibles). */
export function toOpenAiMessages(request: CompletionRequest): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  const context = contextAsText(request.context);
  for (const m of request.messages) {
    if (m.role === 'system') out.push({ role: 'system', content: context && out.length === 0 ? `${m.content}\n\n${context}` : m.content });
    else if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant')
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) }
          : {}),
      });
    else out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
  }
  return out;
}

export class OpenAiProvider implements LlmProvider {
  readonly kind = 'openai' as const;
  readonly model: string;
  constructor(private readonly config: ProviderConfig) {
    this.model = config.model ?? 'gpt-4o';
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const url = `${(this.config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;
    const data = await postJson<OpenAiResponse>(
      this.config.fetch,
      this.kind,
      url,
      {
        model: this.model,
        messages: toOpenAiMessages(request),
        tools: request.tools.map((t) => ({ type: 'function', function: t })),
        tool_choice: 'auto',
      },
      this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {},
      request.signal,
    );
    const choice = data.choices[0];
    const toolCalls = (choice?.message.tool_calls ?? []).map((c) => ({ id: c.id || newCallId(), name: c.function.name, arguments: safeJsonObject(c.function.arguments) }));
    const finish = choice?.finish_reason;
    return {
      content: choice?.message.content ?? '',
      toolCalls,
      stopReason: toolCalls.length ? 'tool_calls' : finish === 'length' ? 'length' : finish === 'content_filter' ? 'refusal' : 'stop',
      ...(data.model ? { model: data.model } : {}),
    };
  }
}
