import { ProviderError, type FetchLike, type ProviderKind } from '../types';

export async function postJson<T>(
  fetcher: FetchLike | undefined,
  provider: ProviderKind,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const doFetch = fetcher ?? (globalThis.fetch?.bind(globalThis) as FetchLike | undefined);
  if (!doFetch) throw new ProviderError('No hay conexión disponible en este entorno.', provider);
  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw new ProviderError(`No se pudo contactar con el modelo: ${String(error)}`, provider);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ProviderError(`El modelo respondió con un error (${response.status}). ${detail.slice(0, 300)}`, provider, response.status);
  }
  return (await response.json()) as T;
}

export function contextAsText(context?: { nodeId?: string; nodeTitle?: string; nodeText?: string; characters?: string[]; items?: string[] }): string {
  if (!context) return '';
  const parts = [];
  if (context.nodeId) parts.push(`Escena actual: ${context.nodeId}${context.nodeTitle ? ` — ${context.nodeTitle}` : ''}`);
  if (context.nodeText) parts.push(`Texto de la escena:\n${context.nodeText}`);
  if (context.characters?.length) parts.push(`Reparto: ${context.characters.join(', ')}`);
  if (context.items?.length) parts.push(`Objetos: ${context.items.join(', ')}`);
  return parts.join('\n\n');
}
