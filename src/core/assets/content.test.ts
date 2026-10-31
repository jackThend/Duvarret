import { describe, expect, it } from 'vitest';
import { checkAssetContent } from './content';
import { encodeWav } from './wav';

const bytes = (...parts: (string | number[] | Uint8Array)[]) => {
  const chunks = parts.map((p) => (typeof p === 'string' ? new TextEncoder().encode(p) : Uint8Array.from(p)));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
};
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, ...body: (string | number[] | Uint8Array)[]) => {
  const inner = bytes(...body);
  return bytes(u32(8 + inner.length), type, inner);
};
const oggPage = (packet: Uint8Array, flags = 0) => bytes('OggS', [0, flags], new Array(20).fill(0), [1, packet.length], packet);
const ogg = (codec: string) => bytes(oggPage(bytes(codec, new Array(11).fill(1)), 2), oggPage(bytes(new Array(40).fill(7)), 4));
const flac = () => {
  const info = new Array(34).fill(0);
  info[10] = 0x0b; info[11] = 0xb8; info[12] = 0x00; // 48000 Hz en los 20 bits de frecuencia
  return bytes('fLaC', [0x80, 0, 0, 34], info, [0xff, 0xf8, 0, 0]);
};
const mp4 = (handler: string, brand = 'M4A ') => bytes(
  box('ftyp', brand, [0, 0, 0, 0], 'isom'),
  box('moov', box('trak', box('mdia', box('hdlr', [0, 0, 0, 0], [0, 0, 0, 0], handler, new Array(12).fill(0))))),
  box('mdat', new Array(16).fill(1)),
);

describe('checkAssetContent', () => {
  it('acepta cada formato que Duvarret sabe usar cuando sus bytes lo son de verdad', () => {
    const cases: [string, Uint8Array][] = [
      ['voz.wav', encodeWav(new Float32Array(100).fill(0.1), 24000)],
      ['grillos.ogg', ogg('\x01vorbis')],
      ['susurro.opus', ogg('OpusHead')],
      ['lluvia.flac', flac()],
      ['campana.m4a', mp4('soun')],
      ['icono.gif', bytes('GIF89a', [1, 0, 1, 0], new Array(8).fill(0), [0x3b])],
      ['mapa.svg', bytes('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>\n')],
      ['fondo.avif', bytes(box('ftyp', 'avif', [0, 0, 0, 0], 'mif1'), box('meta', new Array(8).fill(0)), box('mdat', [1, 2]))],
    ];
    for (const [name, data] of cases) expect(checkAssetContent(name, data), name).toEqual({ ok: true, name });
  });

  it('rechaza archivos cortados con su nombre y en lengua de artista', () => {
    const cut = (data: Uint8Array) => data.slice(0, data.length - 5);
    for (const [name, data] of [['grillos.ogg', ogg('\x01vorbis')], ['campana.m4a', mp4('soun')], ['icono.gif', bytes('GIF89a', [1, 0, 1, 0], new Array(8).fill(0), [0x3b])]] as const) {
      expect(checkAssetContent(name, cut(data))).toEqual({ ok: false, reason: expect.stringContaining(`«${name}» está incompleto o no es realmente`) });
    }
  });

  it('nombra un vídeo o un documento renombrados como sonido', () => {
    expect(checkAssetContent('pasos.m4a', mp4('vide', 'mp42'))).toEqual({ ok: false, reason: '«pasos.m4a» parece un vídeo, no un sonido.' });
    expect(checkAssetContent('pasos.mp3', bytes('%PDF-1.7', new Array(200).fill(32)))).toEqual({ ok: false, reason: '«pasos.mp3» parece un documento PDF, no un sonido.' });
    expect(checkAssetContent('cielo.png', bytes('<!DOCTYPE html><html></html>'))).toEqual({ ok: false, reason: '«cielo.png» parece una página web, no una imagen.' });
  });

  it('un sonido real con otra extensión de sonido se acepta con la extensión verdadera', () => {
    expect(checkAssetContent('Grillos.mp3', ogg('OpusHead'))).toEqual({ ok: true, name: 'Grillos.ogg' });
  });
});
