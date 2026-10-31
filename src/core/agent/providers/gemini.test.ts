import { describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from './gemini';
import type { CompletionRequest, FetchLike } from '../types';

describe('Conversación firmada de Gemini', () => {
  it('devuelve intactas las partes firmadas después de ejecutar una herramienta, sin mostrar razonamiento privado', async () => {
    const signedParts = [
      { text: 'Razonamiento interno.', thought: true, thoughtSignature: 'opaque-thought-signature' },
      { functionCall: { name: 'edit_scene', args: { node_id: 'inicio' } }, thoughtSignature: 'opaque-tool-signature' },
    ];
    const fetcher = vi.fn<FetchLike>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: signedParts } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'He preparado la escena.', thoughtSignature: 'opaque-final-signature' }] } }] })));
    const provider = new GeminiProvider({ kind: 'gemini', fetch: fetcher });
    const first = await provider.complete({ messages: [{ role: 'user', content: 'Edita el inicio.' }], tools: [] });
    expect(first.content).toBe('');
    expect(first.toolCalls).toHaveLength(1);
    const messages: CompletionRequest['messages'] = [
      { role: 'user', content: 'Edita el inicio.' },
      { role: 'assistant', content: first.content, toolCalls: first.toolCalls, provider: 'gemini', providerContent: first.providerContent },
      { role: 'tool', toolCallId: first.toolCalls[0]!.id, name: 'edit_scene', content: '{"ok":true}' },
    ];
    const second = await provider.complete({ messages, tools: [] });
    const sent = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
    expect(sent.contents[1]).toEqual({ role: 'model', parts: signedParts });
    expect(sent.contents[2].parts[0].functionResponse.name).toBe('edit_scene');
    expect(second.content).toBe('He preparado la escena.');
    expect(second.providerContent).toEqual([{ text: 'He preparado la escena.', thoughtSignature: 'opaque-final-signature' }]);
  });
});
