/**
 * Comprueba que un archivo aportado es de verdad lo que dice su extensión: un WAV cortado, un
 * archivo dañado o un vídeo renombrado a `.mp3` se rechazan al soltarlos, no al reproducir.
 */
import { isValidMedia } from '../ai/media';
import { assetFolderFor } from './usages';

const MIME_BY_EXTENSION: Record<string, string> = {
  wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif',
};

/** Extensión preferida para cada formato, en el orden en que se prueba al reconocer un archivo. */
const EXTENSION_BY_MIME: [string, string][] = [
  ['audio/wav', 'wav'], ['audio/mpeg', 'mp3'], ['audio/ogg', 'ogg'], ['audio/flac', 'flac'], ['audio/mp4', 'm4a'],
  ['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif'], ['image/avif', 'avif'], ['image/svg+xml', 'svg'],
];

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** Qué parece el archivo cuando no es ningún formato que Duvarret use, para nombrarlo al rechazarlo. */
function lookalike(data: Uint8Array): string | null {
  const ascii = (from: number, to: number) => new TextDecoder().decode(data.slice(from, to));
  // Un MP4 solo cuenta como vídeo si declara una pista de vídeo; si no, es un M4A dañado.
  if ((ascii(4, 8) === 'ftyp' && ascii(0, data.length).includes('vide')) || (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) || (ascii(0, 4) === 'RIFF' && ascii(8, 11) === 'AVI')) return 'un vídeo';
  if (ascii(0, 4) === 'OggS' && ascii(29, 35) === 'theora') return 'un vídeo';
  if (ascii(0, 5) === '%PDF-') return 'un documento PDF';
  if (ascii(0, 2) === 'PK') return 'un archivo comprimido o un documento de oficina';
  if (/^\s*<(!doctype html|html)/i.test(ascii(0, 64))) return 'una página web';
  return null;
}

export type AssetContent = { ok: true; name: string } | { ok: false; reason: string };

/**
 * Valida los bytes de un archivo aportado. Si es un formato válido con la extensión equivocada
 * (un WAV llamado `.mp3`), lo acepta con su extensión real en `name`; si no, explica el motivo
 * en lengua de artista.
 */
export function checkAssetContent(fileName: string, data: Uint8Array): AssetContent {
  const folder = assetFolderFor(fileName);
  const expected = folder === 'audio' ? 'un sonido' : 'una imagen';
  const mime = MIME_BY_EXTENSION[extensionOf(fileName)];
  if (mime && isValidMedia(data, mime)) return { ok: true, name: fileName };
  const real = EXTENSION_BY_MIME.find(([candidate]) => candidate !== mime && isValidMedia(data, candidate));
  if (real && assetFolderFor(`x.${real[1]}`) === folder) return { ok: true, name: fileName.replace(/\.[^.]+$/, '') + `.${real[1]}` };
  const looks = real ? (assetFolderFor(`x.${real[1]}`) === 'audio' ? 'un sonido' : 'una imagen') : lookalike(data);
  if (looks) return { ok: false, reason: `«${fileName}» parece ${looks}, no ${expected}.` };
  return { ok: false, reason: `«${fileName}» está incompleto o no es realmente ${expected}.` };
}
