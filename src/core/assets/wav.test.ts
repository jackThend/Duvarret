import { describe, expect, it } from 'vitest';
import { encodeWav, trimSilence } from './wav';

describe('encodeWav', () => {
  it('escribe una cabecera PCM mono de 16 bits', () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), 24000);
    const view = new DataView(bytes.buffer);
    const text = (o: number, n: number) => String.fromCharCode(...bytes.slice(o, o + n));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32767, 32767]);
  });
});

describe('trimSilence', () => {
  it('recorta el silencio de los extremos con margen', () => {
    const samples = new Float32Array(1000);
    samples.fill(0.5, 400, 600);
    const trimmed = trimSilence(samples, 1000, 0.02, 0.05);
    expect(trimmed.length).toBe(200 + 2 * 50);
  });

  it('devuelve vacío si todo es silencio', () => {
    expect(trimSilence(new Float32Array(100), 1000).length).toBe(0);
  });
});
