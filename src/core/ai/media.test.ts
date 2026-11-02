import { describe, expect, it, vi } from 'vitest';
import { generateImageWith, generateSoundEffectWith, generateSpeechWith } from './media';
import type { FetchLike } from '../agent/types';
import { encodeWav } from '../assets/wav';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkV0AAAAASUVORK5CYII=';
const wav = encodeWav(new Float32Array(240).fill(0.2), 24000);
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));
const rawInteraction = (type: 'image' | 'audio', data = type === 'image' ? png : b64(wav), mimeType = type === 'image' ? 'image/png' : 'audio/wav') => new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type, data, mime_type: mimeType }] }] }));

describe('Medios de IA con proveedores propios', () => {
  it('consume imágenes del REST Interactions sin reservar un recurso ficticio', async () => {
    const fetcher = vi.fn<FetchLike>(async () => rawInteraction('image'));
    const result = await generateImageWith(fetcher, { provider: 'gemini', model: 'gemini-nano-banana-2.1', prompt: 'Un faro de papel', aspectRatio: '16:9' });
    expect(result.data.slice(0, 4)).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(result.mimeType).toBe('image/png');
    expect(fetcher.mock.calls[0]?.[0]).toContain('/v1beta/interactions');
    const request = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    expect(request.input).toEqual([{ type: 'text', text: 'Un faro de papel' }]);
    expect(request.response_format.aspect_ratio).toBe('16:9');
  });
  it('una respuesta sin imagen o con cuota agotada falla sin fabricar archivos', async () => {
    await expect(generateImageWith(async () => new Response('{"steps":[]}'), { provider: 'gemini', model: 'editable', prompt: 'Mar' })).rejects.toThrow('no devolvió una imagen');
    await expect(generateImageWith(async () => new Response('secret should never surface', { status: 429 }), { provider: 'gemini', model: 'editable', prompt: 'Mar' })).rejects.toThrow('límite');
  });
  it('Cloudflare valida la cuenta y solicita FLUX con el formato documentado', async () => {
    const jpeg = new Uint8Array([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,12,13,14,15,16,17,18,255,217]);
    const fetcher = vi.fn<FetchLike>(async () => new Response(JSON.stringify({ success: true, result: { image: b64(jpeg) } })));
    const input = { provider: 'cloudflare' as const, model: '@cf/black-forest-labs/flux-1-schnell', prompt: 'Mar', accountId: 'a'.repeat(32) };
    const result = await generateImageWith(fetcher, input);
    expect(result.mimeType).toBe('image/jpeg');
    expect(fetcher.mock.calls[0]?.[0]).toContain(`/accounts/${input.accountId}/ai/run/@cf/`);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string).steps).toBe(4);
    await expect(generateImageWith(fetcher, { ...input, accountId: '../escape' })).rejects.toThrow('identificador');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('Gemini mantiene el texto literal separado de las instrucciones y solicita WAV completo', async () => {
    const fetcher = vi.fn<FetchLike>(async () => rawInteraction('audio'));
    await generateSpeechWith(fetcher, { provider: 'gemini', model: 'gemini-3.8-flash-tts', voice: 'Kore', text: 'No olvides mi nombre.', style: 'Dulce y pausada' });
    const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    expect(body.input[0].content[0].text).toBe('No olvides mi nombre.');
    expect(body.input[0].content[0].annotations[0].style).toBe('Dulce y pausada');
    expect(body.response_format.mime_type).toBe('audio/wav');
    expect(body.generation_config.speech_config).toEqual([{ voice: 'Kore' }]);
  });
  it('ElevenLabs devuelve MP3 y conserva el identificador de voz como un solo segmento', async () => {
    const mp3 = new Uint8Array(128); mp3.set([255, 251, 144, 0]);
    const fetcher = vi.fn<FetchLike>(async () => new Response(mp3));
    const result = await generateSpeechWith(fetcher, { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice: 'voice/name', text: 'Hola' });
    expect(fetcher.mock.calls[0]?.[0]).toContain('voice%2Fname?output_format=mp3_44100_128');
    expect(result.mimeType).toBe('audio/mpeg');
  });
  it('el compatible exige un WAV real y respeta el endpoint propio', async () => {
    const invalid = vi.fn<FetchLike>(async () => new Response('not audio'));
    const request = { provider: 'compatible' as const, model: 'voz-propia', voice: 'narradora', text: 'Hola', baseUrl: 'https://voz.example/v1' };
    await expect(generateSpeechWith(invalid, request)).rejects.toThrow('WAV');
    expect(invalid.mock.calls[0]?.[0]).toBe('https://voz.example/v1/audio/speech');
    const valid = await generateSpeechWith(async () => new Response(wav.slice().buffer), request);
    expect(valid.mimeType).toBe('audio/wav');
  });
  it('ElevenLabs genera efectos de sonido en MP3 y rechaza lo que no lo es', async () => {
    const mp3 = new Uint8Array(256); mp3.set([255, 251, 144, 0]);
    const fetcher = vi.fn<FetchLike>(async () => new Response(mp3));
    const result = await generateSoundEffectWith(fetcher, { text: 'grillos en una noche de verano', durationSeconds: 6 });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128');
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toMatchObject({ text: 'grillos en una noche de verano', duration_seconds: 6 });
    expect(result).toMatchObject({ mimeType: 'audio/mpeg', provider: 'elevenlabs' });
    await expect(generateSoundEffectWith(async () => new Response('<html>error</html>'), { text: 'grillos' })).rejects.toThrow('incompleto');
    await expect(generateSoundEffectWith(fetcher, { text: 'grillos', durationSeconds: 45 })).rejects.toThrow('entre 0,5 y 30');
    await expect(generateSoundEffectWith(async () => new Response('', { status: 401 }), { text: 'grillos' })).rejects.toThrow('no autorizó');
  });
  it('rechaza respuestas 200 con MIME correcto pero bytes de error o WAV truncado', async () => {
    await expect(generateImageWith(async () => rawInteraction('image', 'AQID'), { provider: 'gemini', model: 'editable', prompt: 'Mar' })).rejects.toThrow('incompleto');
    await expect(generateSpeechWith(async () => rawInteraction('audio', b64(wav.slice(0, 45))), { provider: 'gemini', model: 'editable', voice: 'Kore', text: 'Hola' })).rejects.toThrow('incompleto');
  });
});
