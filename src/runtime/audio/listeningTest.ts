/**
 * Prueba de escucha a ciegas (KPI 3 del roadmap): ¿el oyente distingue si un sonido está delante,
 * detrás, a la izquierda o a la derecha? El objetivo es acertar más del 90 %.
 */
import type { Coordinates } from '@/core/manifest';

export const DIRECTIONS = {
  delante: { x: 0, y: 0, z: 2 },
  detras: { x: 0, y: 0, z: -2 },
  izquierda: { x: -2, y: 0, z: 0 },
  derecha: { x: 2, y: 0, z: 0 },
} as const satisfies Record<string, Coordinates>;

export type Direction = keyof typeof DIRECTIONS;
export const DIRECTION_LABELS: Record<Direction, string> = { delante: 'Delante', detras: 'Detrás', izquierda: 'Izquierda', derecha: 'Derecha' };
export const KPI_TARGET = 0.9;

export interface Answer {
  expected: Direction;
  heard: Direction;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Ensayos equilibrados (cada dirección el mismo número de veces) en orden aleatorio. */
export function makeTrials(perDirection = 3, seed = Date.now()): Direction[] {
  const random = rng(seed);
  const trials = (Object.keys(DIRECTIONS) as Direction[]).flatMap((d) => Array<Direction>(perDirection).fill(d));
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [trials[i], trials[j]] = [trials[j]!, trials[i]!];
  }
  return trials;
}

export function scoreAnswers(answers: Answer[]) {
  const hits = answers.filter((a) => a.expected === a.heard).length;
  const byDirection = Object.fromEntries(
    (Object.keys(DIRECTIONS) as Direction[]).map((d) => {
      const asked = answers.filter((a) => a.expected === d);
      return [d, asked.length ? asked.filter((a) => a.heard === d).length / asked.length : 0];
    }),
  ) as Record<Direction, number>;
  // La confusión típica de la escucha binaural: delante ↔ detrás.
  const frontBack = answers.filter((a) => (a.expected === 'delante' && a.heard === 'detras') || (a.expected === 'detras' && a.heard === 'delante')).length;
  const accuracy = answers.length ? hits / answers.length : 0;
  return { total: answers.length, hits, accuracy, byDirection, frontBack, passes: accuracy > KPI_TARGET };
}

/** Tres ráfagas de ruido de banda ancha (se localizan mucho mejor que un tono puro). */
export function noiseBursts(sampleRate = 44_100, seed = 7): Float32Array {
  const random = rng(seed);
  const burst = Math.round(0.18 * sampleRate);
  const gap = Math.round(0.12 * sampleRate);
  const out = new Float32Array(3 * burst + 2 * gap);
  const fade = Math.round(0.01 * sampleRate);
  for (let b = 0; b < 3; b++) {
    const start = b * (burst + gap);
    for (let i = 0; i < burst; i++) {
      const envelope = Math.min(1, i / fade, (burst - i) / fade);
      out[start + i] = (random() * 2 - 1) * 0.5 * envelope;
    }
  }
  return out;
}
