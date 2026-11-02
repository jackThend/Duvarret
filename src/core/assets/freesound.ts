/**
 * Banco libre de sonidos: Freesound filtrado a CC0, la única licencia que no obliga a arrastrar
 * créditos por obra y permite uso comercial. Se descarga el preview en alta calidad, que basta con
 * la clave de API (los originales exigen OAuth2; decisión §4.2 de docs/11).
 * API: https://freesound.org/docs/api/resources_apiv2.html#text-search
 */
import type { FetchLike } from '../agent/types';
import { checkAssetContent } from './content';

export const FREESOUND_API = 'https://freesound.org/apiv2';
const FIELDS = 'id,name,username,license,duration,previews,url';

export interface BankSound {
  id: number;
  name: string;
  author: string;
  /** Licencia legible para el registro de procedencia. */
  license: string;
  seconds: number;
  /** MP3 en alta calidad del CDN público de Freesound. */
  previewUrl: string;
  /** Ficha del sonido en Freesound, para acreditar o consultar. */
  pageUrl: string;
}

interface RawSound { id?: unknown; name?: unknown; username?: unknown; license?: unknown; duration?: unknown; url?: unknown; previews?: Record<string, unknown> }

const isCc0 = (license: string) => /publicdomain\/zero|creative commons 0/i.test(license);

/** Previews solo del CDN de Freesound: nunca se descarga nada de otra dirección que diga la respuesta. */
export function isFreesoundPreview(url: string): boolean {
  try {
    const target = new URL(url);
    return target.protocol === 'https:' && target.hostname === 'cdn.freesound.org' && target.pathname.startsWith('/previews/') && !target.search && !target.username && !target.password && !target.hash;
  } catch {
    return false;
  }
}

export async function searchSoundBank(fetcher: FetchLike, query: string, options: { pageSize?: number; signal?: AbortSignal } = {}): Promise<BankSound[]> {
  const text = query.trim();
  if (!text) throw new Error('Escribe qué sonido buscas, por ejemplo «grillos» o «pasos en madera».');
  const params = new URLSearchParams({ query: text, filter: 'license:"Creative Commons 0"', fields: FIELDS, page_size: String(options.pageSize ?? 12) });
  const response = await fetcher(`${FREESOUND_API}/search/text/?${params}`, { headers: { accept: 'application/json' }, ...(options.signal ? { signal: options.signal } : {}) });
  if (response.status === 401 || response.status === 403) throw new Error('Freesound no aceptó la clave. Revísala en Preferencias → Conexiones de IA.');
  if (response.status === 429) throw new Error('Freesound alcanzó su límite de búsquedas por hoy. Vuelve a intentarlo más tarde.');
  if (!response.ok) throw new Error(`Freesound no pudo buscar ahora (${response.status}). Vuelve a intentarlo.`);
  const body = (await response.json()) as { results?: RawSound[] };
  return (body.results ?? []).flatMap((raw) => {
    const preview = raw.previews?.['preview-hq-mp3'];
    const license = String(raw.license ?? '');
    // El filtro se pide al servidor, pero también se comprueba aquí: nada que no sea CC0 entra en la obra.
    if (typeof raw.id !== 'number' || typeof preview !== 'string' || !isFreesoundPreview(preview) || !isCc0(license)) return [];
    return [{
      id: raw.id,
      name: String(raw.name ?? `Sonido ${raw.id}`).trim(),
      author: String(raw.username ?? 'Anónimo'),
      license: 'CC0 1.0 (dominio público)',
      seconds: typeof raw.duration === 'number' ? raw.duration : 0,
      previewUrl: preview,
      pageUrl: typeof raw.url === 'string' ? raw.url : `https://freesound.org/s/${raw.id}/`,
    }];
  });
}

/** Descarga el preview y comprueba que es de verdad un sonido antes de que toque la obra. */
export async function downloadBankSound(fetcher: FetchLike, sound: BankSound, signal?: AbortSignal): Promise<{ name: string; data: Uint8Array }> {
  if (!isFreesoundPreview(sound.previewUrl)) throw new Error('Ese sonido no viene del banco libre de Freesound.');
  const response = await fetcher(sound.previewUrl, signal ? { signal } : {});
  if (!response.ok) throw new Error(`No se pudo descargar «${sound.name}» (${response.status}). Vuelve a intentarlo.`);
  const data = new Uint8Array(await response.arrayBuffer());
  const base = sound.name.replace(/\.[a-z0-9]{2,4}$/i, '') || `freesound ${sound.id}`;
  const content = checkAssetContent(`${base}.mp3`, data);
  if (!content.ok) throw new Error(content.reason);
  return { name: content.name, data };
}

/** Procedencia completa para el registro (RF-14): autor y licencia quedan siempre rellenos. */
export function bankProvenance(sound: BankSound, query: string) {
  return { title: sound.name, author: sound.author, license: sound.license, provider: `Freesound · ${sound.pageUrl}`, prompt: query };
}
