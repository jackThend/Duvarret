import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../agent/types';
import { bankProvenance, downloadBankSound, isFreesoundPreview, searchSoundBank, type BankSound } from './freesound';

const mp3 = () => { const data = new Uint8Array(256); data.set([255, 251, 144, 0]); return data; };
const result = (overrides: Record<string, unknown> = {}) => ({
  id: 42, name: 'Grillos de noche.wav', username: 'campo', license: 'http://creativecommons.org/publicdomain/zero/1.0/', duration: 12.5,
  url: 'https://freesound.org/people/campo/sounds/42/', previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/previews/0/42_1-hq.mp3' }, ...overrides,
});
const sound: BankSound = { id: 42, name: 'Grillos de noche.wav', author: 'campo', license: 'CC0 1.0 (dominio público)', seconds: 12.5, previewUrl: 'https://cdn.freesound.org/previews/0/42_1-hq.mp3', pageUrl: 'https://freesound.org/people/campo/sounds/42/' };

describe('banco libre (Freesound)', () => {
  it('busca solo CC0 y devuelve autor, licencia y preview de cada sonido', async () => {
    const fetcher = vi.fn<FetchLike>(async () => new Response(JSON.stringify({ results: [result()] })));
    const found = await searchSoundBank(fetcher, ' grillos ');
    expect(found).toEqual([sound]);
    const url = new URL(fetcher.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://freesound.org/apiv2/search/text/');
    expect(url.searchParams.get('query')).toBe('grillos');
    expect(url.searchParams.get('filter')).toBe('license:"Creative Commons 0"');
    // La clave no viaja en la dirección: la pone el transporte en la cabecera.
    expect(url.searchParams.has('token')).toBe(false);
  });

  it('descarta lo que no es CC0 o no viene del CDN de Freesound aunque el servidor lo devuelva', async () => {
    const fetcher: FetchLike = async () => new Response(JSON.stringify({ results: [
      result({ id: 1, license: 'http://creativecommons.org/licenses/by/4.0/' }),
      result({ id: 2, previews: { 'preview-hq-mp3': 'https://otro.example/previews/x.mp3' } }),
      result({ id: 3, previews: {} }),
      result({ id: 4 }),
    ] }));
    expect((await searchSoundBank(fetcher, 'lluvia')).map((s) => s.id)).toEqual([4]);
    expect(isFreesoundPreview('https://cdn.freesound.org/previews/1/1-hq.mp3?token=x')).toBe(false);
    expect(isFreesoundPreview('http://cdn.freesound.org/previews/1/1-hq.mp3')).toBe(false);
  });

  it('nombra los fallos en lengua de artista', async () => {
    await expect(searchSoundBank(async () => new Response('', { status: 401 }), 'x')).rejects.toThrow('Freesound no aceptó la clave');
    await expect(searchSoundBank(async () => new Response('', { status: 429 }), 'x')).rejects.toThrow('límite');
    await expect(searchSoundBank(async () => new Response('{}'), '  ')).rejects.toThrow('Escribe qué sonido buscas');
  });

  it('descarga el preview, lo valida y lo nombra como MP3', async () => {
    const fetcher = vi.fn<FetchLike>(async () => new Response(mp3()));
    const file = await downloadBankSound(fetcher, sound);
    expect(fetcher.mock.calls[0]![0]).toBe(sound.previewUrl);
    expect(file.name).toBe('Grillos de noche.mp3');
    await expect(downloadBankSound(async () => new Response('<!doctype html><html></html>'), sound)).rejects.toThrow('parece una página web, no un sonido');
    await expect(downloadBankSound(fetcher, { ...sound, previewUrl: 'https://otro.example/x.mp3' })).rejects.toThrow('no viene del banco libre');
    expect(bankProvenance(sound, 'grillos')).toEqual({ title: 'Grillos de noche.wav', author: 'campo', license: 'CC0 1.0 (dominio público)', provider: `Freesound · ${sound.pageUrl}`, prompt: 'grillos' });
  });
});
