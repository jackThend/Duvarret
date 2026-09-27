import { nextRandom } from '../engine/rng';
import type { RoomModel } from './rooms';

/**
 * Sintetiza una respuesta al impulso estéreo determinista para la reverberación convolutiva:
 * ruido decorrelado por canal con caída exponencial (RT60) y amortiguación progresiva de agudos.
 */
export function synthesizeImpulse(room: RoomModel, sampleRate: number, reflection = 1, seed = 1): [Float32Array, Float32Array] {
  const length = Math.max(1, Math.round(sampleRate * Math.min(6, room.rt60 * 1.2)));
  const preDelay = Math.round((room.preDelayMs / 1000) * sampleRate);
  const channels: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)];
  // Caída de 60 dB en rt60 segundos: amplitud = 10^(-3 t / rt60).
  const decayPerSample = Math.pow(10, -3 / (room.rt60 * sampleRate));
  let state = seed >>> 0;
  channels.forEach((data, ch) => {
    let env = reflection;
    let lp = 0;
    for (let i = 0; i < length; i++) {
      if (i >= preDelay) {
        const r = nextRandom(state + ch * 7919);
        state = r.state;
        const noise = r.value * 2 - 1;
        const progress = i / length;
        const alpha = 1 - room.damping * progress; // más oscuro con el tiempo
        lp = lp + alpha * (noise - lp);
        data[i] = lp * env;
      }
      env *= decayPerSample;
    }
  });
  return channels;
}
