import { describe, expect, it } from 'vitest';
import { validateManifest } from '../manifest';
import { sampleManifest } from '@/runtime/__fixtures__/sample';
import { LocalDirectorProvider, OllamaProvider, PROBE_ASSET, probeProvider, type CompletionResponse, type LlmProvider } from './index';

const manifest = () => validateManifest(sampleManifest()).manifest;

function scripted(responses: CompletionResponse[]): LlmProvider {
  let i = 0;
  return { kind: 'ollama', model: 'guionizado', complete: async () => responses[Math.min(i++, responses.length - 1)]! };
}

const place = (args: Record<string, unknown>): CompletionResponse => ({
  content: '',
  stopReason: 'tool_calls',
  toolCalls: [{ id: 'c1', name: 'placeSpatialAudio', arguments: { node_id: 'inicio', asset_path: PROBE_ASSET, ...args } }],
});
const done: CompletionResponse = { content: 'Listo: el reloj suena a tu izquierda.', toolCalls: [], stopReason: 'stop' };

describe('probeProvider', () => {
  it('aprueba al director local sin conexión', async () => {
    const report = await probeProvider(new LocalDirectorProvider(), manifest());
    expect(report.checks.map((c) => [c.id, c.ok])).toEqual([
      ['connection', true],
      ['tools', true],
      ['placement', true],
      ['valid', true],
    ]);
    expect(report.ok).toBe(true);
    expect(report.tools).toContain('placeSpatialAudio');
  });

  it('aprueba a un modelo que usa bien las herramientas y no toca la obra original', async () => {
    const original = manifest();
    const report = await probeProvider(scripted([place({ coordinates: { x: -2, y: 0, z: 0 } }), done]), original);
    expect(report.ok).toBe(true);
    expect(report.steps).toBe(2);
    expect(report.checks.find((c) => c.id === 'placement')!.detail).toBe('x=-2, y=0, z=0');
    expect(original.nodes[0]!.acoustic_events.some((e) => e.asset === PROBE_ASSET)).toBe(false);
  });

  it('detecta un modelo que solo responde con texto', async () => {
    const report = await probeProvider(scripted([{ content: '{"asset": "reloj"}', toolCalls: [], stopReason: 'stop' }]), manifest());
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === 'tools')).toMatchObject({ ok: false, detail: 'Respondió solo con texto.' });
  });

  it('detecta un sonido mal situado o una llamada inválida', async () => {
    const right = await probeProvider(scripted([place({ coordinates: { x: 2, y: 0, z: 0 } }), done]), manifest());
    expect(right.checks.find((c) => c.id === 'placement')!.ok).toBe(false);
    const invalid = await probeProvider(scripted([place({ node_id: 'no_existe' }), done]), manifest());
    expect(invalid.checks.find((c) => c.id === 'tools')).toMatchObject({ ok: false });
  });

  it('informa del fallo de conexión', async () => {
    const offline: LlmProvider = { kind: 'anthropic', model: 'claude-opus-5', complete: () => Promise.reject(new Error('ECONNREFUSED')) };
    const report = await probeProvider(offline, manifest());
    expect(report.checks[0]).toMatchObject({ id: 'connection', ok: false });
    expect(report.checks[0]!.detail).toContain('ECONNREFUSED');
  });
});

describe('OllamaProvider: fallos con indicaciones concretas', () => {
  const run = (fetch: (url: string) => Promise<Response>) => probeProvider(new OllamaProvider({ kind: 'ollama', model: 'gemma:2b', fetch }), manifest());
  const reply = (status: number, error: string) => async () => new Response(JSON.stringify({ error }), { status });

  it('sin servicio, modelo sin descargar o sin herramientas', async () => {
    expect((await run(() => Promise.reject(new TypeError('fetch failed')))).checks[0]!.detail).toContain('¿Está abierto? (o ejecuta «ollama serve»)');
    expect((await run(reply(404, 'model "gemma:2b" not found, try pulling it first'))).checks[0]!.detail).toBe('El modelo «gemma:2b» no está descargado. Ejecuta «ollama pull gemma:2b».');
    expect((await run(reply(400, 'registry.ollama.ai/library/gemma:2b does not support tools'))).checks[0]!.detail).toContain('no admite herramientas');
  });
});
