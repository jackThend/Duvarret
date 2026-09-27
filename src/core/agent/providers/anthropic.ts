import Anthropic from '@anthropic-ai/sdk';
import { contextAsText } from './http';
import { ProviderError, safeJsonObject, type CompletionRequest, type CompletionResponse, type LlmProvider, type ProviderConfig } from '../types';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';
/** Reintento automático en el servidor con otro modelo si el principal declina la petición. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentParam = Anthropic.Beta.BetaContentBlockParam;

/** Traduce la conversación agnóstica al formato de la Messages API. */
export function toClaudeMessages(request: CompletionRequest): { system: string; messages: MessageParam[] } {
  const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content);
  const context = contextAsText(request.context);
  if (context) system.push(context);

  const messages: MessageParam[] = [];
  const pushUserBlock = (block: ContentParam) => {
    const last = messages.at(-1);
    // Todos los resultados de herramientas de un turno viajan en un único mensaje de usuario.
    if (last?.role === 'user' && Array.isArray(last.content)) last.content.push(block);
    else messages.push({ role: 'user', content: [block] });
  };

  for (const m of request.messages) {
    if (m.role === 'user') messages.push({ role: 'user', content: [{ type: 'text', text: m.content }] });
    else if (m.role === 'assistant') {
      if (m.provider === 'anthropic' && Array.isArray(m.providerContent)) {
        // Se reenvía intacto (incluye bloques de pensamiento).
        messages.push({ role: 'assistant', content: m.providerContent as ContentParam[] });
      } else {
        const content: ContentParam[] = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const call of m.toolCalls ?? []) content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments });
        if (content.length) messages.push({ role: 'assistant', content });
      }
    } else if (m.role === 'tool') {
      pushUserBlock({ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content, ...(m.isError ? { is_error: true } : {}) });
    }
  }
  return { system: system.join('\n\n'), messages };
}

/** Conector de Anthropic Claude mediante el SDK oficial. */
export class AnthropicProvider implements LlmProvider {
  readonly kind = 'anthropic' as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly config: ProviderConfig) {
    this.model = config.model ?? DEFAULT_CLAUDE_MODEL;
    this.client = new Anthropic({
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      ...(config.fetch ? { fetch: config.fetch as typeof fetch, maxRetries: 0 } : {}),
      // El Studio es una aplicación de escritorio local: la clave la aporta y guarda el propio autor.
      dangerouslyAllowBrowser: true,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const { system, messages } = toClaudeMessages(request);
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: this.config.maxTokens ?? 16000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          ...(system ? { system } : {}),
          messages,
          tools: request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema })),
        },
        request.signal ? { signal: request.signal } : undefined,
      );
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new ProviderError('La clave de Claude no es válida.', this.kind, 401);
      if (error instanceof Anthropic.RateLimitError) throw new ProviderError('Claude está saturado; inténtalo en unos instantes.', this.kind, 429);
      if (error instanceof Anthropic.APIError) throw new ProviderError(`Claude respondió con un error (${error.status ?? 'sin estado'}).`, this.kind, error.status);
      throw new ProviderError(`No se pudo contactar con Claude: ${String(error)}`, this.kind);
    }

    let text = '';
    const toolCalls = [];
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
      else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, arguments: safeJsonObject(block.input) });
    }
    const stop = response.stop_reason;
    return {
      content: text,
      // Una negativa no ejecuta herramientas aunque aparezcan bloques parciales.
      toolCalls: stop === 'refusal' ? [] : toolCalls,
      stopReason: stop === 'refusal' ? 'refusal' : stop === 'tool_use' ? 'tool_calls' : stop === 'max_tokens' ? 'length' : 'stop',
      providerContent: response.content,
      model: response.model,
    };
  }
}
