/**
 * Sintetiza el foley de la obra insignia como WAV (mono, 22.05 kHz, 16 bits) de forma
 * determinista: cualquier máquina produce exactamente los mismos archivos.
 *
 *   npm run foley -- works/el-corazon-delator.duvarret/assets/audio/sfx
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RATE = 22050;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.89 / peak : 1;
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const buffer = (seconds: number) => new Float32Array(Math.round(seconds * RATE));

/** Filtro paso-bajo de un polo. */
function lowpass(x: Float32Array, cutoff: number) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < x.length; i++) x[i] = y += a * (x[i]! - y);
  return x;
}

function thump(out: Float32Array, at: number, freq: number, decay: number, amp: number) {
  const start = Math.round(at * RATE);
  for (let i = 0; start + i < out.length && i < RATE; i++) {
    const t = i / RATE;
    const f = freq * (1 + 0.8 * Math.exp(-t * 40)); // leve caída de tono
    out[start + i]! += amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * decay) * Math.min(1, t * 400);
  }
}

const SOUNDS: Record<string, () => Float32Array> = {
  // Latido "lub-dub" a 60 ppm; se repite en bucle.
  heartbeat: () => {
    const out = buffer(1);
    thump(out, 0.02, 48, 14, 1);
    thump(out, 0.28, 42, 16, 0.7);
    return lowpass(out, 180);
  },
  // Tictac del reloj de la muerte (el "death-watch" en la pared).
  clock: () => {
    const out = buffer(1);
    const n = rng(3);
    for (const [at, tone] of [[0.0, 3200], [0.5, 2600]] as const) {
      const s = Math.round(at * RATE);
      for (let i = 0; i < 500; i++) out[s + i]! += (n() * 0.6 + Math.sin((2 * Math.PI * tone * i) / RATE)) * Math.exp(-i / 60);
    }
    return out;
  },
  // Bisagra que chirría al abrir la puerta con infinita lentitud.
  creak: () => {
    const out = buffer(1.4);
    const n = rng(5);
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE;
      const f = 180 + 90 * Math.sin(t * 5.3) + 40 * Math.sin(t * 23);
      phase += (2 * Math.PI * f) / RATE;
      const saw = (phase / Math.PI) % 2 - 1;
      out[i] = (saw * 0.7 + n() * 0.15) * Math.sin((Math.PI * t) / 1.4) * (0.6 + 0.4 * Math.abs(Math.sin(t * 31)));
    }
    return lowpass(out, 2400);
  },
  // Tres golpes secos en la puerta de la calle.
  knock: () => {
    const out = buffer(1.6);
    const n = rng(7);
    for (const at of [0.05, 0.42, 0.79]) {
      thump(out, at, 95, 30, 1);
      const s = Math.round(at * RATE);
      for (let i = 0; i < 900; i++) out[s + i]! += n() * 0.5 * Math.exp(-i / 120);
    }
    return lowpass(out, 900);
  },
  // Crujido de tablones del suelo.
  floor: () => {
    const out = buffer(0.9);
    const n = rng(11);
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE;
      phase += (2 * Math.PI * (90 + 60 * t)) / RATE;
      const grain = Math.sin(phase) > 0.2 ? 1 : 0;
      out[i] = (grain * 0.5 + n() * 0.3) * Math.sin((Math.PI * t) / 0.9);
    }
    return lowpass(out, 1400);
  },
  // Respiración contenida del viejo en la oscuridad.
  breath: () => {
    const out = buffer(3.2);
    const n = rng(13);
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE;
      const env = Math.pow(Math.max(0, Math.sin((Math.PI * t) / 1.6)), 2);
      out[i] = n() * env;
    }
    return lowpass(out, 700);
  },
  // Un grito agudo que se quiebra.
  scream: () => {
    const out = buffer(1.2);
    const n = rng(17);
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE;
      const f = 620 + 220 * Math.sin(t * 2.2) - 180 * t + 18 * Math.sin(t * 38);
      phase += (2 * Math.PI * f) / RATE;
      out[i] = (Math.sin(phase) + 0.45 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase) + n() * 0.2) * Math.min(1, t * 12) * Math.exp(-t * 1.6);
    }
    return lowpass(out, 3500);
  },
  // Noche: viento sordo y lejano (bucle).
  night: () => {
    const out = buffer(6);
    const n = rng(19);
    for (let i = 0; i < out.length; i++) {
      const t = i / RATE;
      out[i] = n() * (0.45 + 0.35 * Math.sin((2 * Math.PI * t) / 6) ** 2);
    }
    lowpass(out, 320);
    // Fundido cruzado para que el bucle no tenga costura.
    const fade = Math.round(0.4 * RATE);
    for (let i = 0; i < fade; i++) {
      const w = i / fade;
      out[i] = out[i]! * w + out[out.length - fade + i]! * (1 - w);
    }
    return out.slice(0, out.length - fade);
  },
  // Cuatro campanadas del reloj de la iglesia.
  bell: () => {
    const out = buffer(6);
    const partials = [1, 2.0, 2.4, 3.0, 4.2, 5.4];
    for (let k = 0; k < 4; k++) {
      const s = Math.round(k * 1.35 * RATE);
      for (let i = 0; s + i < out.length; i++) {
        const t = i / RATE;
        let v = 0;
        partials.forEach((p, j) => (v += Math.sin(2 * Math.PI * 196 * p * t) * Math.exp(-t * (0.9 + j * 0.8)) / (j + 1)));
        out[s + i]! += v * Math.min(1, t * 300);
      }
    }
    return out;
  },
};

export function synthesizeAll(dir: string) {
  mkdirSync(dir, { recursive: true });
  const written: Record<string, number> = {};
  for (const [name, make] of Object.entries(SOUNDS)) {
    const data = wav(make());
    writeFileSync(join(dir, `${name}.wav`), data);
    written[name] = data.length;
  }
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const dir = resolve(process.argv[2] ?? 'works/el-corazon-delator.duvarret/assets/audio/sfx');
  const written = synthesizeAll(dir);
  for (const [name, bytes] of Object.entries(written)) console.log(`${name}.wav  ${(bytes / 1024).toFixed(1)} KB`);
}
