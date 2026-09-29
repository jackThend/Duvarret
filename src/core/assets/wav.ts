/** Codificación WAV (PCM de 16 bits, mono): el formato que todos los motores web decodifican. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // tamaño del bloque fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes por segundo
  view.setUint16(32, 2, true); // bytes por muestra
  view.setUint16(34, 16, true); // bits por muestra
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff), true));
  return bytes;
}

/**
 * Recorta el silencio del principio y del final (el clic de «Grabar» y la pausa antes de
 * «Detener»), dejando un pequeño margen para que la voz no empiece de golpe.
 */
export function trimSilence(samples: Float32Array, sampleRate: number, threshold = 0.02, marginSeconds = 0.15): Float32Array {
  let start = samples.findIndex((s) => Math.abs(s) > threshold);
  if (start < 0) return samples.slice(0, 0);
  let end = samples.length - 1;
  while (end > start && Math.abs(samples[end]!) <= threshold) end--;
  const margin = Math.round(marginSeconds * sampleRate);
  start = Math.max(0, start - margin);
  end = Math.min(samples.length, end + 1 + margin);
  return samples.slice(start, end);
}
