import { newCallId, safeJsonObject, type CompletionRequest, type CompletionResponse, type JsonSchema, type LlmProvider, type ProviderConfig } from '../types';
import { contextAsText, postJson } from './http';

type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } };
interface GeminiResponse {
  modelVersion?: string;
  candidates?: { finishReason?: string; content?: { parts?: Part[] } }[];
  promptFeedback?: { blockReason?: string };
}

/** Gemini acepta un subconjunto de JSON Schema: se eliminan las claves que no admite. */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as JsonSchema)) {
    if (['$schema', 'additionalProperties', 'default', '$id', 'title'].includes(key)) continue;
    out[key] = toGeminiSchema(value);
  }
  return out;
}

export class GeminiProvider implements LlmProvider {
  readonly kind = 'gemini' as const;
  readonly model: string;
  constructor(private readonly config: ProviderConfig) {
    this.model = config.model ?? 'gemini-2.5-pro';
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const base = (this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const url = `${base}/models/${encodeURIComponent(this.model)}:generateContent`;
    const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content);
    const context = contextAsText(request.context);
    if (context) system.push(context);

    const contents: { role: 'user' | 'model'; parts: Part[] }[] = [];
    const push = (role: 'user' | 'model', part: Part) => {
      const last = contents.at(-1);
      if (last?.role === role) last.parts.push(part);
      else contents.push({ role, parts: [part] });
    };
    for (const m of request.messages) {
      if (m.role === 'user') push('user', { text: m.content });
      else if (m.role === 'assistant') {
        if (m.content) push('model', { text: m.content });
        for (const call of m.toolCalls ?? []) push('model', { functionCall: { name: call.name, args: call.arguments } });
      } else if (m.role === 'tool') push('user', { functionResponse: { name: m.name, response: { result: safeJsonObject(m.content), text: m.content } } });
    }

    const data = await postJson<GeminiResponse>(
      this.config.fetch,
      this.kind,
      url,
      {
        ...(system.length ? { systemInstruction: { parts: [{ text: system.join('\n\n') }] } } : {}),
        contents,
        tools: [{ functionDeclarations: request.tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }],
      },
      this.config.apiKey ? { 'x-goog-api-key': this.config.apiKey } : {},
      request.signal,
    );
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const toolCalls = parts.filter((p) => p.functionCall).map((p) => ({ id: newCallId('gemini'), name: p.functionCall!.name, arguments: safeJsonObject(p.functionCall!.args) }));
    const blocked = !!data.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY';
    return {
      content: parts.map((p) => p.text ?? '').join(''),
      toolCalls,
      stopReason: blocked ? 'refusal' : toolCalls.length ? 'tool_calls' : candidate?.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
      ...(data.modelVersion ? { model: data.modelVersion } : {}),
    };
  }
}
