import type { FetchLike } from '../agent/types';
import type { GeneratedMedia, ImageGenerationRequest, SpeechGenerationRequest } from './types';

const INTERACTIONS = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_MEDIA_BYTES = 48 * 1024 * 1024;

export function decodeBase64(encoded: string, limit = MAX_MEDIA_BYTES): Uint8Array {
  if (encoded.length > Math.ceil(limit / 3) * 4 + 4) throw new Error('El recurso generado supera el tamaño permitido.');
  try { return Uint8Array.from(atob(encoded), char => char.charCodeAt(0)); }
  catch { throw new Error('El proveedor devolvió un recurso incompleto. Reintenta la generación.'); }
}

/** Rechaza páginas de error y archivos truncados antes de registrar un recurso en la obra. */
export function validateGeneratedMedia(data: Uint8Array, mimeType: string): void {
  const invalid = () => { throw new Error('El proveedor devolvió un archivo multimedia vacío, incompleto o con un formato incorrecto.'); };
  if (data.length > MAX_MEDIA_BYTES) invalid();
  const ascii = (from: number, to: number) => new TextDecoder().decode(data.slice(from, to));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') {
    if (data.length < 46 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WAVE' || view.getUint32(4, true) + 8 > data.length) invalid();
    let format = false; let samples = false;
    for (let offset = 12; offset + 8 <= data.length;) {
      const size = view.getUint32(offset + 4, true); const end = offset + 8 + size;
      if (end > data.length) invalid();
      const kind = ascii(offset, offset + 4);
      if (kind === 'fmt ') {
        if (size < 16) invalid();
        const encoding = view.getUint16(offset + 8, true); const channels = view.getUint16(offset + 10, true); const rate = view.getUint32(offset + 12, true);
        if (![1, 3, 65534].includes(encoding) || channels < 1 || channels > 8 || rate < 8000 || rate > 192000) invalid();
        format = true;
      }
      if (kind === 'data' && size > 0) samples = true;
      offset = end + (size % 2);
    }
    if (!format || !samples) invalid();
    return;
  }
  if (mimeType === 'image/png') {
    if (data.length < 57 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => data[index] === value) || ascii(12, 16) !== 'IHDR' || !view.getUint32(16) || !view.getUint32(20) || ascii(data.length - 8, data.length - 4) !== 'IEND') invalid();
    return;
  }
  if (mimeType === 'image/jpeg') {
    if (data.length < 32 || data[0] !== 0xff || data[1] !== 0xd8 || data.at(-2) !== 0xff || data.at(-1) !== 0xd9) invalid();
    let dimensions = false; let scan = false;
    for (let offset = 2; offset + 4 <= data.length;) {
      if (data[offset] !== 0xff) invalid();
      const marker = data[offset + 1]!;
      if (marker === 0xda) { scan = true; break; }
      const size = view.getUint16(offset + 2);
      if (size < 2 || offset + 2 + size > data.length) invalid();
      if ([0xc0, 0xc1, 0xc2].includes(marker) && size >= 8) dimensions = !!view.getUint16(offset + 5) && !!view.getUint16(offset + 7);
      offset += size + 2;
    }
    if (!dimensions || !scan) invalid();
    return;
  }
  if (mimeType === 'image/webp') {
    if (data.length < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP' || view.getUint32(4, true) + 8 !== data.length || !['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12, 16))) invalid();
    return;
  }
  if (mimeType === 'audio/mpeg') {
    if (data.length < 128) invalid();
    let offset = 0;
    if (ascii(0, 3) === 'ID3') offset = 10 + ((data[6]! & 127) << 21) + ((data[7]! & 127) << 14) + ((data[8]! & 127) << 7) + (data[9]! & 127);
    if (offset + 4 > data.length || data[offset] !== 255 || (data[offset + 1]! & 224) !== 224) invalid();
    return;
  }
  invalid();
}

function nonempty(value: string, label: string): string {
  if (!value.trim()) throw new Error(`Falta ${label}.`);
  return value.trim();
}

async function checked(fetcher: FetchLike, url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('El proveedor no autorizó la generación. Comprueba tu clave, permisos y acceso al modelo.');
    if (response.status === 429) throw new Error('El proveedor alcanzó su límite de uso. Comprueba la cuota o espera antes de reintentar.');
    throw new Error(`El proveedor no pudo generar el recurso (${response.status}). Comprueba el modelo y vuelve a intentarlo.`);
  }
  return response;
}

interface InteractionBlock { type?: string; data?: string; mime_type?: string }
interface Interaction { steps?: { type?: string; content?: InteractionBlock[] }[]; output_image?: InteractionBlock; output_audio?: InteractionBlock }

function interactionMedia(response: Interaction, type: 'image' | 'audio'): { data: Uint8Array; mimeType: string } {
  const blocks = response.steps?.filter(step => step.type === 'model_output').flatMap(step => step.content ?? []).filter(block => block.type === type) ?? [];
  const block = blocks.at(-1) ?? (type === 'image' ? response.output_image : response.output_audio);
  if (!block?.data) throw new Error(`El proveedor no devolvió ${type === 'image' ? 'una imagen' : 'audio'}. Ajusta la solicitud o elige otro modelo.`);
  const data = decodeBase64(block.data);
  const mimeType = block.mime_type ?? (type === 'image' ? 'image/png' : 'audio/wav');
  if (!(type === 'image' ? ['image/png', 'image/jpeg', 'image/webp'] : ['audio/wav', 'audio/x-wav', 'audio/mpeg']).includes(mimeType)) throw new Error('El proveedor devolvió un formato que Duvarret no puede utilizar.');
  validateGeneratedMedia(data, mimeType);
  return { data, mimeType };
}

/** REST Interactions, no SDK ni claves en el código. Documentación en catalog.ts. */
export async function generateImageWith(fetcher: FetchLike, request: ImageGenerationRequest): Promise<GeneratedMedia> {
  const model = nonempty(request.model, 'el modelo de imágenes');
  const prompt = nonempty(request.prompt, 'la descripción de la imagen');
  if (request.provider === 'cloudflare') {
    if (!request.accountId || !/^[a-f0-9]{32}$/i.test(request.accountId)) throw new Error('Introduce el identificador de cuenta de Cloudflare (32 caracteres).');
    if (prompt.length > 2048) throw new Error('Cloudflare admite hasta 2048 caracteres para la descripción.');
    if (model !== '@cf/black-forest-labs/flux-1-schnell') throw new Error('Esta integración de Cloudflare admite FLUX.1 schnell.');
    const response = await checked(fetcher, `https://api.cloudflare.com/client/v4/accounts/${request.accountId}/ai/run/${model}`, { prompt, steps: 4 }, request.signal);
    const result = await response.json() as { success?: boolean; result?: { image?: string } };
    if (result.success === false || !result.result?.image) throw new Error('Cloudflare no devolvió una imagen. Comprueba los permisos del token y la cuota disponible.');
    const data = decodeBase64(result.result.image);
    validateGeneratedMedia(data, 'image/jpeg');
    return { data, mimeType: 'image/jpeg', provider: request.provider, model };
  }
  const response = await checked(fetcher, INTERACTIONS, {
    model, input: [{ type: 'text', text: prompt }], response_format: { type: 'image', ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}) },
  }, request.signal);
  return { ...interactionMedia(await response.json() as Interaction, 'image'), provider: request.provider, model };
}

export async function generateSpeechWith(fetcher: FetchLike, request: SpeechGenerationRequest): Promise<GeneratedMedia> {
  const model = nonempty(request.model, 'el modelo de voz');
  const voice = nonempty(request.voice, 'la voz o su identificador');
  nonempty(request.text, 'el texto que se narrará');
  if (request.speed !== undefined && (!Number.isFinite(request.speed) || request.speed < 0.7 || request.speed > 1.3)) throw new Error('La velocidad debe estar entre 0,7 y 1,3.');
  if (request.provider === 'gemini') {
    const response = await checked(fetcher, INTERACTIONS, {
      model, input: [{ type: 'user_input', content: [{ type: 'text', text: request.text, annotations: [{ type: 'speech_metadata', style: request.style ?? 'Narración en español cálida, natural, dulce y cercana, sin eco; dicción clara y pausas suaves.' }] }] }],
      response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: 24000 }, generation_config: { speech_config: [{ voice }] },
    }, request.signal);
    return { ...interactionMedia(await response.json() as Interaction, 'audio'), provider: request.provider, model };
  }
  if (request.provider === 'elevenlabs') {
    const response = await checked(fetcher, `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      model_id: model, text: request.text,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, ...(request.speed ? { speed: request.speed } : {}) },
    }, request.signal);
    const data = new Uint8Array(await response.arrayBuffer());
    validateGeneratedMedia(data, 'audio/mpeg');
    return { data, mimeType: 'audio/mpeg', provider: request.provider, model };
  }
  if (request.text.length > 4096) throw new Error('Este proveedor admite hasta 4096 caracteres por frase. Divide el pasaje antes de narrarlo.');
  const baseUrl = request.baseUrl ?? (request.provider === 'openai' ? 'https://api.openai.com/v1' : '');
  if (!baseUrl) throw new Error('Configura la dirección del proveedor de voz compatible.');
  const response = await checked(fetcher, `${baseUrl.replace(/\/$/, '')}/audio/speech`, {
    model, voice, input: request.text, response_format: 'wav', ...(request.speed ? { speed: request.speed } : {}),
  }, request.signal);
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.length < 44 || new TextDecoder().decode(data.slice(0, 4)) !== 'RIFF') throw new Error('El proveedor compatible no devolvió el WAV solicitado. Comprueba su compatibilidad con audio/speech.');
  validateGeneratedMedia(data, 'audio/wav');
  return { data, mimeType: 'audio/wav', provider: request.provider, model };
}
